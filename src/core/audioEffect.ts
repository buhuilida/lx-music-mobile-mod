import settingState from '@/store/setting/state'
import { audioEffectModule, parseEqualizerInfo } from '@/utils/nativeModules/audioEffect'

/**
 * 音效应用（1.16.0）
 * 预设：off / surround（全景环绕）/ cinema（电影院）/ hall（音乐厅）/ bass（低音增强）/ custom（自定义）
 * 原生基于 Equalizer + BassBoost + Virtualizer + PresetReverb（全局混音 session 0）。
 */

export type AudioEffectPreset = 'off' | 'surround' | 'cinema' | 'hall' | 'bass' | 'custom'

interface PresetConfig {
  bass: number
  virtualizer: number
  reverb: string
  eq: number[] | null // 各频段电平(mB)，null 保持设备默认
}

export const AUDIO_EFFECT_PRESETS: Record<Exclude<AudioEffectPreset, 'custom'>, PresetConfig> = {
  off: { bass: 0, virtualizer: 0, reverb: 'none', eq: null },
  // 全景环绕：强立体声扩展 + 厅堂混响，双扬声器获得宽阔声场
  surround: { bass: 30, virtualizer: 85, reverb: 'largehall', eq: null },
  // 电影院：厚重低频 + 中等环绕 + 大厅混响
  cinema: { bass: 55, virtualizer: 60, reverb: 'largehall', eq: null },
  // 音乐厅：自然声场，轻混响
  hall: { bass: 20, virtualizer: 40, reverb: 'mediumhall', eq: null },
  // 低音增强
  bass: { bass: 100, virtualizer: 15, reverb: 'none', eq: null },
}

let applying = false

const releaseApplying = () => {
  applying = false
}

const applyEq = async(levels: number[]) => {
  const info = parseEqualizerInfo(await audioEffectModule.getEqualizerInfo())
  if (!info) return
  for (let i = 0; i < info.bands; i++) {
    const level = levels[i]
    if (level != null) await audioEffectModule.setBandLevel(i, level).catch(() => {})
  }
}

export const applyAudioEffect = async() => {
  if (applying) return
  applying = true
  try {
    const preset = settingState.setting['player.audioEffectPreset'] as AudioEffectPreset
    if (preset == 'off') {
      await audioEffectModule.disable().catch(() => {})
      return
    }
    const config = preset == 'custom'
      ? {
          bass: settingState.setting['player.audioEffectBass'],
          virtualizer: settingState.setting['player.audioEffectVirtualizer'],
          reverb: settingState.setting['player.audioEffectReverb'],
          eq: settingState.setting['player.audioEffectEq'],
        }
      : AUDIO_EFFECT_PRESETS[preset]

    if (config == null) return
    await audioEffectModule.enable().catch(() => {})
    if (config.eq?.length) await applyEq(config.eq).catch(() => {})
    await audioEffectModule.setBassBoost(config.bass).catch(() => {})
    await audioEffectModule.setVirtualizer(config.virtualizer).catch(() => {})
    await audioEffectModule.setReverb(config.reverb).catch(() => {})
  } finally {
    releaseApplying()
  }
}

export const initAudioEffect = async() => {
  await applyAudioEffect()
}
