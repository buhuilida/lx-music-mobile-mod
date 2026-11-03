import { NativeModules } from 'react-native'

const { MediaStoreModule } = NativeModules

export interface MediaStoreAudio {
  path: string
  name: string
  title: string
  artist: string
  album: string
  /** 毫秒 */
  duration: number
  size: number
}

/**
 * 系统媒体库（1.23.0）
 *
 * 目录遍历在分区存储 / 各家 ROM 私有目录下拿不到全部音频，
 * 这里直接查 MediaStore，一次拿到全设备音频索引。
 */
const hasModule = !!MediaStoreModule

export const isMediaStoreAvailable = () => hasModule

export const getAudioFiles = async(): Promise<MediaStoreAudio[]> => {
  if (!hasModule) return []
  const list = await MediaStoreModule.getAudioFiles() as MediaStoreAudio[]
  return Array.isArray(list) ? list : []
}
