import RNFS from 'react-native-fs'
import { PermissionsAndroid, Platform } from 'react-native'
import { existsFile, readDir, externalStorageDirectoryPath } from '@/utils/fs'
import { createList, overwriteListMusics, getListMusics } from '@/core/list'
import listState from '@/store/list/state'

/**
 * 本地音乐扫描（1.16.0，参照 LX-X 的本地音乐库；1.17.1 重写）
 *
 * 修复点：
 * 1. 之前把 `file://` 前缀写进了 meta.filePath，导致 existsFile / stat / 播放器
 *    都解析不到文件（本地歌曲无法播放、也无法读取封面歌词），现在统一存纯路径，
 *    只在交给播放器 / Image 时再加 file://。
 * 2. 补齐 MusicInfoLocal 必需的 songId / ext 字段，避免列表渲染、元信息编辑时出错。
 * 3. 扫描前主动申请存储权限，扫描中分批让出 JS 线程并限制数量，避免大目录扫描时
 *    界面卡死（表现为黑屏）。
 * 4. 没有扫到歌曲时也保证「本地音乐」歌单存在，避免点击侧边栏进入空白页。
 */

const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'ape', 'm4a', 'ogg', 'aac', 'wma', 'opus', 'm4b', 'aiff']
const MAX_FILES = 5000
const MAX_DEPTH = 5
const SKIP_DIR_NAMES = new Set(['android', 'data', 'obb', 'lost.dir', '.thumbnails', '$recycle.bin'])

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

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
}

const isAudioFile = (name: string) => AUDIO_EXTS.includes(getExt(name))

/** 「歌名 - 歌手.mp3」解析出歌名与歌手；解析失败则整名作为歌名 */
const parseFileName = (fileName: string) => {
  const name = fileName.replace(/\.[^.]+$/, '').trim()
  for (const sep of [' - ', ' — ', ' – ', '－']) {
    const idx = name.indexOf(sep)
    if (idx > 0) {
      return { name: name.slice(0, idx).trim(), singer: name.slice(idx + sep.length).trim() }
    }
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

const getScanDirs = () => {
  const dirs = [
    `${externalStorageDirectoryPath}/Music`,
    `${externalStorageDirectoryPath}/Download`,
    `${externalStorageDirectoryPath}/Sounds`,
    RNFS.DownloadDirectoryPath,
  ]
  return Array.from(new Set(dirs.filter(Boolean)))
}

/** 申请读取音频权限（Android 13+ 用 READ_MEDIA_AUDIO） */
export const requestScanPermission = async(): Promise<boolean> => {
  if (Platform.OS != 'android') return true
  const version = typeof Platform.Version == 'number' ? Platform.Version : parseInt(String(Platform.Version), 10)
  try {
    const permission = (version >= 33
      ? (PermissionsAndroid.PERMISSIONS as unknown as Record<string, string>).READ_MEDIA_AUDIO ?? 'android.permission.READ_MEDIA_AUDIO'
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE) as Parameters<typeof PermissionsAndroid.request>[0]
    const result = await PermissionsAndroid.request(permission, {
      title: global.i18n.t('setting_local_music_permission_title'),
      message: global.i18n.t('setting_local_music_permission_message'),
      buttonPositive: global.i18n.t('ok'),
      buttonNegative: global.i18n.t('cancel'),
    })
    return result === PermissionsAndroid.RESULTS.GRANTED
  } catch {
    return false
  }
}

type ProgressHandler = (count: number) => void

/**
 * 扫描本地音频文件（只读取路径，不读标签，保证速度）
 */
export const scanLocalMusic = async(onProgress?: ProgressHandler): Promise<LX.Music.MusicInfoLocal[]> => {
  const files: Array<{ path: string, name: string }> = []
  const seen = new Set<string>()
  let lastReport = 0

  const report = (force = false) => {
    if (!onProgress) return
    const now = Date.now()
    if (!force && now - lastReport < 200) return
    lastReport = now
    onProgress(files.length)
  }

  const scanDir = async(dir: string, depth: number) => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return
    let items: ScannedFile[]
    try {
      items = await readDir(dir) as unknown as ScannedFile[]
    } catch {
      return
    }
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (files.length >= MAX_FILES) return
      if (!item?.name || !item.path) continue
      const lowerName = item.name.toLowerCase()
      if (item.isDirectory) {
        if (lowerName.startsWith('.') || SKIP_DIR_NAMES.has(lowerName)) continue
        await scanDir(item.path, depth + 1)
      } else if (item.isFile && isAudioFile(item.name)) {
        // 统一成纯路径，去掉可能存在的 file:// 前缀
        const path = item.path.replace(/^file:\/\//, '')
        if (seen.has(path)) continue
        seen.add(path)
        files.push({ path, name: item.name })
        if (files.length % 50 == 0) {
          report()
          // 让出 JS 线程，避免扫描大目录时界面无响应
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }
    report()
  }

  for (const dir of getScanDirs()) {
    if (files.length >= MAX_FILES) break
    if (!await existsFile(dir).catch(() => false)) continue
    await scanDir(dir, 0)
  }
  report(true)

  const infos: LX.Music.MusicInfoLocal[] = files.map(file => {
    const { name, singer } = parseFileName(file.name)
    const info: LX.Music.MusicInfoLocal = {
      id: `local_${hashCode(file.path)}`,
      source: 'local',
      name,
      singer,
      interval: null,
      meta: {
        songId: file.path,
        albumName: '',
        picUrl: null,
        filePath: file.path,
        ext: getExt(file.name),
      },
    }
    return info
  })
  return infos.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/** 保证「本地音乐」歌单存在（没有歌曲时也创建，避免进入空白页面） */
export const ensureLocalList = async() => {
  const exists = listState.userList.some(list => list.id == LOCAL_LIST_ID)
  if (!exists) await createList({ name: LOCAL_LIST_NAME, id: LOCAL_LIST_ID, list: [], position: -1 })
}

/**
 * 扫描并写入「本地音乐」歌单（覆盖式：以最近一次扫描结果为准）
 */
export const scanAndSyncLocalList = async(onProgress?: ProgressHandler): Promise<number> => {
  const granted = await requestScanPermission()
  if (!granted) throw new Error(global.i18n.t('setting_local_music_no_permission'))
  const infos = await scanLocalMusic(onProgress)
  await ensureLocalList()
  await overwriteListMusics(LOCAL_LIST_ID, infos as unknown as LX.Music.MusicInfo[])
  return infos.length
}

export const getLocalMusics = async() => getListMusics(LOCAL_LIST_ID)
