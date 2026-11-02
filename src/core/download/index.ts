import RNFS from 'react-native-fs'
import { getData, saveData } from '@/plugins/storage'
import { getMusicUrl, getLyricInfo } from '@/core/music'
import { existsFile, mkdir, privateStorageDirectoryPath, stat, unlink } from '@/utils/fs'
import { checkStoragePermissions, requestStoragePermission, toast } from '@/utils/tools'
import downloadState from '@/store/download/state'
import downloadActions from '@/store/download/action'
import { getListMusics } from '@/utils/listManage'
import settingState from '@/store/setting/state'
import { QUALITY_ORDER, getQualityFileExt } from '@/config/quality'

const storageKey = '@__download_list__'

// 系统「下载」目录：/storage/emulated/0/Download
export const publicDownloadDirectoryPath = RNFS.DownloadDirectoryPath
// 没有存储权限时的兜底目录（App 私有目录）
export const privateDownloadDirectoryPath = `${privateStorageDirectoryPath}/download`
export const downloadDirectoryPath = privateDownloadDirectoryPath

const fileExt = (quality: LX.Quality): string => getQualityFileExt(quality)

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim()

export const buildItemId = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
  return `${musicInfo.source}_${musicInfo.id}_${quality}`
}

/**
 * 可选的下载音质，优先取歌曲本身提供的音质列表
 */
export const getMusicQualities = (musicInfo: LX.Music.MusicInfoOnline): LX.Quality[] => {
  const qualitys = Object.keys(musicInfo.meta._qualitys ?? {}) as LX.Quality[]
  const order = QUALITY_ORDER
  const list = qualitys.filter(q => order.includes(q)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  if (list.length) return list
  // 没有音质信息时给出常见档位，实际下载时由音源自动降级
  return ['128k', '320k', 'flac']
}

const ensureDir = async(dir = privateDownloadDirectoryPath) => {
  const exists = await existsFile(dir)
  if (!exists) await mkdir(dir)
}

const storageCache: { granted: boolean | null, writable: boolean | null } = { granted: null, writable: null }

/**
 * 公共下载目录是否真的可写（部分系统即使给了权限也会拦截旧式直写）
 */
const probeWritable = async(dir: string) => {
  if (storageCache.writable != null) return storageCache.writable
  const probe = `${dir}/.lx_write_test`
  try {
    await RNFS.writeFile(probe, '1', 'utf8')
    await RNFS.unlink(probe).catch(() => {})
    storageCache.writable = true
  } catch {
    storageCache.writable = false
  }
  return storageCache.writable
}

let showedPrivateTip = false

/**
 * 解析下载目录：优先写入系统 Download 文件夹，没有存储权限时回退到私有目录
 */
export const resolveDownloadDirectory = async(): Promise<string> => {
  let granted = storageCache.granted
  if (granted == null) {
    try {
      granted = await checkStoragePermissions()
    } catch {
      granted = false
    }
  }
  if (!granted) {
    try {
      granted = (await requestStoragePermission()) === true
    } catch {
      granted = false
    }
  }
  storageCache.granted = granted
  if (granted) {
    await ensureDir(publicDownloadDirectoryPath).catch(() => {})
    if (await probeWritable(publicDownloadDirectoryPath)) return publicDownloadDirectoryPath
  }
  if (!showedPrivateTip) {
    showedPrivateTip = true
    toast(global.i18n.t('download_no_permission_tip'), 'long')
  }
  return privateDownloadDirectoryPath
}

const saveList = async(list: LX.Download.ExtItem[]) => {
  downloadActions.setList(list)
  await saveData(storageKey, list)
}

let inited = false
/**
 * 初始化下载模块：读取列表并剔除已被删除的文件
 */
export const initDownload = async() => {
  if (inited) return
  inited = true
  await ensureDir(privateDownloadDirectoryPath).catch(() => {})
  const saved = await getData<LX.Download.ExtItem[]>(storageKey) ?? []
  const list: LX.Download.ExtItem[] = []
  await Promise.all(saved.map(async(item) => {
    try {
      if (await existsFile(item.filePath)) list.push(item)
    } catch {}
  }))
  list.sort((a, b) => b.createdAt - a.createdAt)
  downloadActions.setList(list)
}

export const getDownloadList = () => downloadState.list

export const findDownload = (musicInfoId: string) => {
  return downloadState.list.find(item => item.musicInfo.id == musicInfoId)
}

const updateTask = (id: string, task: Partial<LX.Download.ExtTask>) => {
  downloadActions.setTask(id, task)
}

export const clearTask = (id: string) => {
  downloadActions.removeTask(id)
}

/**
 * 下载歌曲到 App 私有目录
 * @param quality 指定音质，不传则使用设置里的默认下载音质
 */
export const downloadMusic = async(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality): Promise<boolean> => {
  const id = buildItemId(musicInfo, quality)
  if (downloadState.list.some(item => item.id == id)) return true
  if (downloadState.tasks[id]?.status == 'downloading') return true

  updateTask(id, {
    id,
    status: 'waiting',
    progress: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
  })

  let url: string
  try {
    url = await getMusicUrl({ musicInfo, quality, isRefresh: true })
  } catch (err: any) {
    updateTask(id, { status: 'error', message: err?.message ?? 'get url failed' })
    return false
  }

  const targetDir = await resolveDownloadDirectory()
  try {
    await ensureDir(targetDir)
  } catch {
    // 目录不可写（例如权限被系统回收）时回退到私有目录
    await ensureDir(privateDownloadDirectoryPath)
  }
  const ext = fileExt(quality)
  const style = settingState.setting['download.fileNameStyle'] ?? 'name-singer'
  const baseName = style == 'singer-name'
    ? `${safeName(musicInfo.singer)} - ${safeName(musicInfo.name)}`
    : style == 'name' ? safeName(musicInfo.name) : `${safeName(musicInfo.name)} - ${safeName(musicInfo.singer)}`
  const fileName = `${baseName}.${ext}`
  let filePath = `${targetDir}/${fileName}`
  if (await existsFile(filePath)) filePath = `${targetDir}/${baseName}_${Date.now()}.${ext}`

  const startedAt = Date.now()
  const ret = RNFS.downloadFile({
    fromUrl: url,
    toFile: filePath,
    progressInterval: 400,
    progress: (res) => {
      const elapsed = (Date.now() - startedAt) / 1000
      updateTask(id, {
        id,
        status: 'downloading',
        progress: res.contentLength > 0 ? Math.floor(res.bytesWritten / res.contentLength * 100) : 0,
        downloaded: res.bytesWritten,
        total: res.contentLength,
        speed: elapsed > 0 ? Math.floor(res.bytesWritten / elapsed) : 0,
      })
    },
  })

  try {
    const result = await ret.promise
    if (result.statusCode && (result.statusCode < 200 || result.statusCode >= 300)) throw new Error(`HTTP ${result.statusCode}`)
    // 下载完成后按需保存同名 .lrc 歌词文件（1.16.0）
    if (settingState.setting['download.saveLrcFile']) {
      void getLyricInfo({ musicInfo }).then(async(lyricInfo) => {
        if (!lyricInfo?.lyric) return
        const lrcPath = `${targetDir}/${baseName}.lrc`
        return RNFS.writeFile(lrcPath, lyricInfo.lyric, 'utf8').catch(() => {})
      }).catch(() => {})
    }
    const info = await stat(filePath).catch(() => null)
    const item: LX.Download.ExtItem = {
      id,
      musicInfo,
      quality,
      filePath,
      fileName,
      ext,
      size: info?.size ?? 0,
      createdAt: Date.now(),
    }
    await saveList([item, ...downloadState.list])
    updateTask(id, { status: 'completed', progress: 100 })
    setTimeout(() => { clearTask(id) }, 1200)
    global.app_event.downloadListUpdate()
    return true
  } catch (err: any) {
    try {
      if (await existsFile(filePath)) await unlink(filePath)
    } catch {}
    updateTask(id, { status: 'error', message: err?.message ?? 'download failed' })
    return false
  }
}

/**
 * 取歌曲可用的最高音质（用于「一键下载全部」「最高音质下载」）
 */
export const getBestQuality = (musicInfo: LX.Music.MusicInfoOnline): LX.Quality => {
  const qualitys = Object.keys(musicInfo.meta?._qualitys ?? {}) as LX.Quality[]
  if (!qualitys.length) return '320k'
  const list = getMusicQualities(musicInfo)
  return list[list.length - 1] ?? '320k'
}

/**
 * 一键下载一组歌曲（1.17.1）
 * - 自动跳过本地歌曲与已下载过的歌曲
 * - 不指定音质时逐首取「最高可用音质」
 * - 并发 3 首，避免同时开太多连接被音源限流
 */
export const downloadMusics = async(musics: LX.Music.MusicInfo[], options: {
  quality?: LX.Quality
  onProgress?: (done: number, total: number) => void
} = {}): Promise<{ total: number, success: number, failed: number }> => {
  const downloadedIds = new Set(downloadState.list.map(item => item.musicInfo.id))
  const targets = musics.filter((musicInfo) => {
    if (musicInfo.source == 'local') return false
    if (downloadedIds.has(musicInfo.id)) return false
    return true
  }) as LX.Music.MusicInfoOnline[]

  const result = { total: targets.length, success: 0, failed: 0 }
  if (!targets.length) return result

  let cursor = 0
  let done = 0
  const worker = async() => {
    while (cursor < targets.length) {
      const musicInfo = targets[cursor++]
      const quality = options.quality ?? getBestQuality(musicInfo)
      const ok = await downloadMusic(musicInfo, quality).catch(() => false)
      if (ok) result.success++
      else result.failed++
      done++
      options.onProgress?.(done, targets.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker))
  return result
}

/**
 * 一键下载整个歌单
 */
export const downloadListMusics = async(listId: string, options: {
  quality?: LX.Quality
  onProgress?: (done: number, total: number) => void
} = {}) => {
  const musics = await getListMusics(listId)
  return downloadMusics(musics, options)
}

export const removeDownload = async(id: string) => {
  const item = downloadState.list.find(item => item.id == id)
  if (!item) return
  try {
    if (await existsFile(item.filePath)) await unlink(item.filePath)
  } catch {}
  await saveList(downloadState.list.filter(item => item.id != id))
  global.app_event.downloadListUpdate()
}

/**
 * 把已下载的歌曲转换成可播放的本地歌曲信息
 */
export const buildLocalMusicInfo = (item: LX.Download.ExtItem): LX.Music.MusicInfoLocal => {
  return {
    id: `download_${item.id}`,
    name: item.musicInfo.name,
    singer: item.musicInfo.singer,
    source: 'local',
    interval: item.musicInfo.interval,
    meta: {
      songId: item.filePath,
      albumName: item.musicInfo.meta.albumName,
      picUrl: item.musicInfo.meta.picUrl ?? null,
      filePath: item.filePath,
      ext: item.ext,
      // 保留原始在线信息，便于读取歌词、封面时回退到在线搜索
      toggleMusicInfo: item.musicInfo,
    },
  }
}

export const formatSize = (size: number) => {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let value = size
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(value >= 10 || index == 0 ? 0 : 1)} ${units[index]}`
}
