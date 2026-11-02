import { NativeModules } from 'react-native'

const { AudioEffect } = NativeModules

export interface EqualizerInfo {
  bands: number
  minLevel: number
  maxLevel: number
  /** [centerFreq, level, centerFreq, level ...] 交替数组 */
  bandsRaw: number[]
}

export const audioEffectModule = AudioEffect as {
  getEqualizerInfo: () => Promise<number[] | null>
  enable: () => Promise<boolean>
  disable: () => Promise<boolean>
  setBandLevel: (band: number, level: number) => Promise<boolean>
  setBassBoost: (strength: number) => Promise<boolean>
  setVirtualizer: (strength: number) => Promise<boolean>
  setReverb: (preset: string) => Promise<boolean>
}

/** 解析原生返回的均衡器信息（[bands, min, max, c0, l0, c1, l1 ...]） */
export const parseEqualizerInfo = (raw: number[] | null): EqualizerInfo | null => {
  if (!raw || raw.length < 3) return null
  const bands = raw[0]
  const minLevel = raw[1]
  const maxLevel = raw[2]
  const bandsRaw = raw.slice(3)
  if (bandsRaw.length < bands * 2) return null
  return { bands, minLevel, maxLevel, bandsRaw }
}
