import { NativeModules, Platform } from 'react-native'

interface ExtNativeModule {
  pickImage: () => Promise<{ path: string }>
  speak: (text: string, rate: number) => Promise<boolean>
  stopSpeak: () => Promise<boolean>
  showIsland: (options: {
    title?: string
    text?: string
    sub?: string
    playing?: boolean
    percent?: number
  }) => void
  hideIsland: () => void
  isNotificationEnabled: () => Promise<boolean>
}

const ext: Partial<ExtNativeModule> = Platform.OS === 'android'
  ? (NativeModules.Ext as ExtNativeModule | undefined) ?? {}
  : {}

/**
 * 调起系统相册选择图片，返回复制到 App 私有目录后的绝对路径
 * 用户取消或平台不支持时返回 null
 */
export const pickImage = async(): Promise<string | null> => {
  if (!ext.pickImage) return null
  try {
    const result = await ext.pickImage()
    return result?.path ?? null
  } catch {
    // 用户取消不算错误
    return null
  }
}

/**
 * 语音播报一段文字，rate 为语速倍率
 */
export const speak = async(text: string, rate = 1): Promise<void> => {
  if (!ext.speak || !text) return
  try {
    await ext.speak(text, rate)
  } catch {}
}

export const stopSpeak = async(): Promise<void> => {
  if (!ext.stopSpeak) return
  try {
    await ext.stopSpeak()
  } catch {}
}

export interface IslandOptions {
  title?: string
  text?: string
  sub?: string
  playing?: boolean
  percent?: number
}

/**
 * 更新歌词灵动岛/常驻通知
 * Android 16 起会尝试提升为 Live Update，低版本为普通常驻通知
 */
export const showIsland = (options: IslandOptions) => {
  if (!ext.showIsland) return
  try {
    ext.showIsland(options)
  } catch {}
}

export const hideIsland = () => {
  if (!ext.hideIsland) return
  try {
    ext.hideIsland()
  } catch {}
}

export const isNotificationEnabled = async(): Promise<boolean> => {
  if (!ext.isNotificationEnabled) return true
  try {
    return await ext.isNotificationEnabled()
  } catch {
    return true
  }
}

export const isExtSupported = Platform.OS === 'android' && !!ext.speak
