import RNFS from 'react-native-fs'
import { existsFile, readDir } from '@/utils/fs'
import { createList, overwriteListMusics } from '@/core/list'
import listState from '@/store/list/state'

/**
 * 本地音乐扫描（1.16.0，参照 LX-X 的本地音乐库）
 * 扫描设备公共音乐目录的音频文件，写入「本地音乐」歌单，可直接播放。
 */

const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'ape', 'm4a', 'ogg', 'aac', 'wma', 'opus']
const SCAN_DIRS = [
  '/storage/emulated/0/Music',
  '/storage/emulated/0/Download',
  RNFS.DownloadDirectoryPath,
]

export const LOCAL_LIST_ID = 'userlist_local_music'
export const LOCAL_LIST_NAME = '本地音乐'

// 简易字符串 hash，用于从路径生成稳定的歌曲 id
const hashCode = (str: string) => {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

const isAudioFile = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXTS.includes(ext)
}

/** 「歌名 - 歌手.mp3」解析出歌名与歌手；解析失败则整名作为歌名 */
const parseFileName = (fileName: string) => {
  const name = fileName.replace(/\.[^.]+$/, '').trim()
  const idx = name.indexOf(' - ')
  if (idx > 0) {
    return { name: name.slice(0, idx).trim(), singer: name.slice(idx + 3).trim() }
  }
  const idx2 = name.indexOf('—')
  if (idx2 > 0) {
    return { name: name.slice(0, idx2).trim(), singer: name.slice(idx2 + 1).trim() }
  }
  return { name, singer: '' }
}

interface ScannedFile {
  isFile: boolean
  isDirectory: boolean
  name: string
  path: string
}

const scanDir = async(dir: string, files: Array<{ path: string, name: string }>, depth = 0) => {
  if (depth > 4) return
  const items = await readDir(dir).catch(() => [] as ScannedFile[])
  for (const item of items as unknown as ScannedFile[]) {
    if (item.isFile && isAudioFile(item.name)) {
      files.push({ path: item.path.startsWith('file://') ? item.path : `file://${item.path}`, name: item.name })
    } else if (item.isDirectory) {
      await scanDir(item.path, files, depth + 1)
    }
  }
}

export const scanLocalMusic = async(): Promise<LX.Music.MusicInfoLocal[]> => {
  const files: Array<{ path: string, name: string }> = []
  const seen = new Set<string>()
  for (const dir of SCAN_DIRS) {
    if (!await existsFile(dir).catch(() => false)) continue
    await scanDir(dir, files)
  }
  const infos: LX.Music.MusicInfoLocal[] = []
  for (const file of files) {
    if (seen.has(file.path)) continue
    seen.add(file.path)
    const { name, singer } = parseFileName(file.name)
    infos.push({
      id: `local_${hashCode(file.path)}`,
      source: 'local',
      name,
      singer,
      interval: '',
      meta: {
        albumName: '',
        filePath: file.path,
        description: '',
        picUrl: null,
      },
    } as unknown as LX.Music.MusicInfoLocal)
  }
  return infos
}

/**
 * 扫描并写入「本地音乐」歌单（覆盖式：以最近一次扫描结果为准）
 */
export const scanAndSyncLocalList = async(): Promise<number> => {
  const infos = await scanLocalMusic()
  const exists = listState.userList.some(list => list.id == LOCAL_LIST_ID)
  if (!exists && infos.length) {
    await createList({ name: LOCAL_LIST_NAME, id: LOCAL_LIST_ID, list: [], position: -1 })
  }
  if (infos.length) await overwriteListMusics(LOCAL_LIST_ID, infos as unknown as LX.Music.MusicInfo[])
  return infos.length
}
