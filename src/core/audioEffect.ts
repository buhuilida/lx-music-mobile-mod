import settingState from '@/store/setting/state'
import { audioEffectModule, parseEqualizerInfo } from '@/utils/nativeModules/audioEffect'

/**
 * 音效引擎（1.18.0）
 *
 * 参考网易云 / QQ 音乐的听感设计，基于 android.media.audiofx 组合：
 * Equalizer（多段均衡）+ BassBoost（低频）+ Virtualizer（声场扩展）+
 * PresetReverb（空间混响）+ LoudnessEnhancer（响度增强）。
 *
 * 预设用「频率 → 增益(dB)」节点描述，运行时按设备实际频段插值，
 * 因此 5 段 / 10 段均衡器的手机都能得到接近的听感。
 */

export type AudioEffectPreset =
  | 'off'
  | 'vocal'
  | 'bass'
  | 'surround'
  | 'live'
  | 'electronic'
  | 'rock'
  | 'folk'
  | 'classical'
  | 'jazz'
  | 'cinema'
  | 'hall'
  | 'custom'

export interface EqNode {
  /** 频率 Hz */
  f: number
  /** 增益 dB */
  g: number
}

interface PresetConfig {
  bass: number
  virtualizer: number
  reverb: string
  /** 响度增强，单位毫贝（100 = 1dB） */
  loudness: number
  eq: EqNode[] | null
}

export const AUDIO_EFFECT_PRESETS: Record<Exclude<AudioEffectPreset, 'custom'>, PresetConfig> = {
  off: { bass: 0, virtualizer: 0, reverb: 'none', loudness: 0, eq: null },
  // 人声增强：压低低频浑浊，抬高 1k~4k 的咬字与气息
  vocal: {
    bass: 0,
    virtualizer: 10,
    reverb: 'none',
    loudness: 150,
    eq: [{ f: 80, g: -3 }, { f: 250, g: -2 }, { f: 1000, g: 3 }, { f: 3000, g: 4 }, { f: 6000, g: 2 }, { f: 12000, g: 0 }],
  },
  // 超重低音：60~150Hz 大幅提升，中高频轻微回拉避免轰头
  bass: {
    bass: 85,
    virtualizer: 15,
    reverb: 'none',
    loudness: 100,
    eq: [{ f: 60, g: 7 }, { f: 150, g: 5 }, { f: 400, g: 0 }, { f: 1000, g: -1 }, { f: 4000, g: 0 }, { f: 10000, g: 1 }],
  },
  // 3D 环绕：强立体声扩展 + 大厅混响
  surround: {
    bass: 25,
    virtualizer: 90,
    reverb: 'largehall',
    loudness: 80,
    eq: [{ f: 100, g: 2 }, { f: 500, g: -1 }, { f: 2000, g: 1 }, { f: 8000, g: 2 }],
  },
  // 现场：中频略突出，中等厅堂混响，接近演唱会前排
  live: {
    bass: 35,
    virtualizer: 45,
    reverb: 'mediumhall',
    loudness: 120,
    eq: [{ f: 120, g: 2 }, { f: 800, g: 2 }, { f: 2500, g: 2 }, { f: 6000, g: 1 }, { f: 12000, g: -1 }],
  },
  // 电子：低频与高频两头翘，节奏感更强
  electronic: {
    bass: 60,
    virtualizer: 55,
    reverb: 'smallroom',
    loudness: 150,
    eq: [{ f: 60, g: 5 }, { f: 200, g: 2 }, { f: 1000, g: -2 }, { f: 3000, g: 2 }, { f: 8000, g: 4 }],
  },
  // 摇滚：鼓点与吉他突出，中频挖一点避免糊
  rock: {
    bass: 50,
    virtualizer: 35,
    reverb: 'mediumroom',
    loudness: 120,
    eq: [{ f: 100, g: 4 }, { f: 500, g: -2 }, { f: 1500, g: 3 }, { f: 4000, g: 4 }, { f: 10000, g: 2 }],
  },
  // 民谣：温暖自然，齿音收敛
  folk: {
    bass: 15,
    virtualizer: 20,
    reverb: 'smallroom',
    loudness: 80,
    eq: [{ f: 150, g: 2 }, { f: 800, g: 2 }, { f: 3000, g: 1 }, { f: 8000, g: -1 }],
  },
  // 古典：声场宽、动态保留，高频通透
  classical: {
    bass: 10,
    virtualizer: 35,
    reverb: 'mediumhall',
    loudness: 60,
    eq: [{ f: 100, g: 1 }, { f: 1000, g: 0 }, { f: 3000, g: 1 }, { f: 8000, g: 2 }, { f: 14000, g: 2 }],
  },
  // 爵士：低频松软、铜管明亮
  jazz: {
    bass: 25,
    virtualizer: 25,
    reverb: 'mediumroom',
    loudness: 80,
    eq: [{ f: 200, g: 2 }, { f: 800, g: 1 }, { f: 2000, g: 1 }, { f: 6000, g: 2 }],
  },
  // 电影院：厚重低频 + 大厅混响
  cinema: {
    bass: 70,
    virtualizer: 70,
    reverb: 'largehall',
    loudness: 180,
    eq: [{ f: 60, g: 5 }, { f: 200, g: 2 }, { f: 1000, g: 0 }, { f: 5000, g: 2 }, { f: 10000, g: 1 }],
  },
  // 音乐厅：自然声场，轻混响
  hall: {
    bass: 20,
    virtualizer: 40,
    reverb: 'mediumhall',
    loudness: 60,
    eq: [{ f: 100, g: 1 }, { f: 1000, g: 0 }, { f: 4000, g: 1 }, { f: 10000, g: 1 }],
  },
}

let applying = false

const releaseApplying = () => {
  applying = false
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** 按设备频段中心频率插值出每个频段的增益（dB） */
export const buildBandGains = (nodes: EqNode[], centers: number[]): number[] => {
  if (!nodes.length) return centers.map(() => 0)
  const sorted = [...nodes].sort((a, b) => a.f - b.f)
  return centers.map((center) => {
    if (center <= sorted[0].f) return sorted[0].g
    const last = sorted[sorted.length - 1]
    if (center >= last.f) return last.g
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const next = sorted[i]
      if (center <= next.f) {
        const ratio = (center - prev.f) / (next.f - prev.f)
        return prev.g + (next.g - prev.g) * ratio
      }
    }
    return 0
  })
}

const applyEqGains = async(gains: number[], minLevel: number, maxLevel: number) => {
  for (let i = 0; i < gains.length; i++) {
    const level = clamp(Math.round(gains[i] * 100), minLevel, maxLevel)
    await audioEffectModule.setBandLevel(i, level).catch(() => {})
  }
}

const applyPresetEq = async(nodes: EqNode[] | null) => {
  if (!nodes?.length) return
  const info = parseEqualizerInfo(await audioEffectModule.getEqualizerInfo())
  if (!info) return
  const centers: number[] = []
  for (let i = 0; i < info.bands; i++) centers.push(info.bandsRaw[i * 2])
  await applyEqGains(buildBandGains(nodes, centers), info.minLevel, info.maxLevel)
}

const applyCustomEq = async(levels: number[]) => {
  if (!levels.length) return
  const info = parseEqualizerInfo(await audioEffectModule.getEqualizerInfo())
  if (!info) return
  const gains = levels.map(level => level / 100)
  await applyEqGains(gains, info.minLevel, info.maxLevel)
}

export const applyAudioEffect = async() => {
  if (applying) return
  applying = true
  try {
    const setting = settingState.setting
    const preset = setting['player.audioEffectPreset'] as AudioEffectPreset
    if (preset == 'off') {
      await audioEffectModule.disable().catch(() => {})
      return
    }
    const config = preset == 'custom'
      ? {
          bass: setting['player.audioEffectBass'],
          virtualizer: setting['player.audioEffectVirtualizer'],
          reverb: setting['player.audioEffectReverb'],
          loudness: setting['player.audioEffectLoudness'] * 9,
          eq: null as EqNode[] | null,
        }
      : AUDIO_EFFECT_PRESETS[preset]

    if (config == null) return
    await audioEffectModule.enable().catch(() => {})
    if (preset == 'custom') await applyCustomEq(setting['player.audioEffectEq']).catch(() => {})
    else await applyPresetEq(config.eq).catch(() => {})
    await audioEffectModule.setBassBoost(config.bass).catch(() => {})
    await audioEffectModule.setVirtualizer(config.virtualizer).catch(() => {})
    await audioEffectModule.setReverb(config.reverb).catch(() => {})
    await audioEffectModule.setLoudnessGain(config.loudness).catch(() => {})
  } finally {
    releaseApplying()
  }
}

export const initAudioEffect = async() => {
  await applyAudioEffect()
}
