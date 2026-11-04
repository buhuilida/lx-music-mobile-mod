import RNFS from 'react-native-fs'
import { getData, saveData } from '@/plugins/storage'
import { getMusicUrl, getLyricInfo, getPicPath } from '@/core/music'
import { getQualityFallbacks } from '@/core/music/utils'
import { existsFile, mkdir, privateStorageDirectoryPath, stat, unlink } from '@/utils/fs'
import { checkStoragePermissions, requestStoragePermission, toast } from '@/utils/tools'
import { writeMetadata, writePic, writeLyric } from '@/utils/localMediaMetadata'
import { scanFile } from '@/utils/nativeModules/utils'
import { buildLyrics } from '@/utils/lrcTools'
import downloadState from '@/store/download/state'
import downloadActions from '@/store/download/action'
import { getListMusics } from '@/utils/listManage'
import settingState from '@/store/setting/state'
import { QUALITY_ORDER, SELECTABLE_QUALITYS, getQualityFileExt } from '@/config/quality'
import { BaiduPanError, errnoToText } from '@/core/baiduPan/api'
import { isBaiduPanLoggedIn, loadBaiduPanAuth } from '@/core/baiduPan/auth'
import { uploadFileToPan } from '@/core/baiduPan/upload'
import { buildAutoWordLyric, buildRawWordLyric } from '@/utils/wordLyric'
import { dlog } from '@/utils/debugLog'

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
 * 歌曲「自身」可用的音质：元信息与音源声明的并集。
 * 只用于计算「最高音质（自动）」与自动下载，不代表下载弹窗的可选范围。
 */
export const getAvailableQualities = (musicInfo: LX.Music.MusicInfoOnline): LX.Quality[] => {
  const metaQualitys = Object.keys(musicInfo.meta._qualitys ?? {}) as LX.Quality[]
  const sourceQualitys = global.lx.qualityList[musicInfo.source] ?? []
  const order = QUALITY_ORDER
  const merged = [...new Set([...metaQualitys, ...sourceQualitys])]
    .filter(q => order.includes(q))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
  // 两者都为空时给出常见档位，实际下载时由音源自动降级
  return merged.length ? merged : ['128k', '320k', 'flac']
}

/**
 * 下载弹窗的可选音质（1.22.17）
 *
 * 固定展示 8 档，不再受歌曲元信息 / 音源声明限制。
 * 之前只看声明，自定义音源普遍没声明 master，导致「播放能出母带、下载弹窗没有母带」。
 * 选到歌曲不支持的档位时，downloadMusic 会按回退链降级，并以实际音质写入下载列表。
 */
export const getMusicQualities = (_musicInfo: LX.Music.MusicInfoOnline): LX.Quality[] => SELECTABLE_QUALITYS

const ensureDir = async(dir = privateDownloadDirectoryPath) => {
  const exists = await existsFile(dir)
  if (!exists) await mkdir(dir)
}

const storageCache: { granted: boolean | null } = { granted: null }
const writableCache = new Map<string, boolean>()

/**
 * 目录是否真的可写（部分系统即使给了权限也会拦截旧式直写）
 */
const probeWritable = async(dir: string, useCache = true) => {
  if (useCache) {
    const cached = writableCache.get(dir)
    if (cached != null) return cached
  }
  const probe = `${dir}/.lx_write_test`
  let writable = false
  try {
    await RNFS.writeFile(probe, '1', 'utf8')
    await RNFS.unlink(probe).catch(() => {})
    writable = true
  } catch {
    writable = false
  }
  writableCache.set(dir, writable)
  return writable
}

/** 供目录选择页使用：检查并创建目录，返回是否真的可写 */
export const checkDirectoryWritable = async(dir: string) => {
  try {
    await ensureDir(dir)
    return await probeWritable(dir, false)
  } catch {
    return false
  }
}

/** 目录可写性发生变化（例如用户重新授权）时清掉缓存 */
export const clearDownloadDirCache = () => {
  writableCache.clear()
  storageCache.granted = null
}

let showedPrivateTip = false
let showedCustomPathTip = false

/**
 * 解析下载目录：自定义目录 → 系统 Download → 应用私有目录
 */
export const resolveDownloadDirectory = async(): Promise<string> => {
  // 1. 用户自定义目录优先
  const customPath = (settingState.setting['download.savePath'] ?? '').trim()
  if (customPath) {
    try {
      await ensureDir(customPath)
      if (await probeWritable(customPath)) return customPath
    } catch {}
    // 静默回退到别处，用户会以为「设置了没生效」，还找不到歌下到哪去了
    if (!showedCustomPathTip) {
      showedCustomPathTip = true
      toast(global.i18n.t('setting_download_path_unavailable'), 'long')
    }
  }

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

const fileNameOfPath = (filePath: string) => filePath.split(/[\\/]/).pop() ?? ''

/** 把上传结果写回下载列表项（任务态会被清掉，列表项要留痕） */
const saveItemUpload = async(itemId: string, upload: LX.Download.ExtItem['upload']) => {
  const list = downloadState.list.map((item) => item.id == itemId ? { ...item, upload } : item)
  await saveList(list)
}

/**
 * 下载完成后上传到百度网盘
 * 失败只影响上传状态，不影响已下载的文件；可在下载页重试
 */
const uploadToPan = async(id: string, item: LX.Download.ExtItem) => {
  const fileName = fileNameOfPath(item.filePath)
  if (!fileName) return

  if (!isBaiduPanLoggedIn()) await loadBaiduPanAuth()
  if (!isBaiduPanLoggedIn()) {
    const upload = { status: 'fail' as const, progress: 0, errorMsg: errnoToText(-6) }
    updateTask(id, { upload })
    await saveItemUpload(item.id, upload)
    toast(`${fileName} ${global.i18n.t('baidu_pan_upload_failed')}：${errnoToText(-6)}`, 'long')
    return
  }

  dlog('pan', '触发上传', fileName, '目标目录=' + String(settingState.setting['download.baiduPanDir']),
    'saveTarget=' + String(settingState.setting['download.saveTarget']))
  updateTask(id, { upload: { status: 'uploading', progress: 0 } })
  try {
    const result = await uploadFileToPan({
      localPath: item.filePath,
      // 优先用任务创建时的目录快照，这样之后改设置不会影响已排队的任务
      dir: item.panDir ?? settingState.setting['download.baiduPanDir'],
      fileName,
      onProgress: ({ percent }) => {
        updateTask(id, { upload: { status: 'uploading', progress: Math.round(percent * 100) } })
      },
    })
    const upload = { status: 'success' as const, progress: 100, remotePath: result.remotePath }
    updateTask(id, { upload })
    await saveItemUpload(item.id, upload)
    toast(`${fileName} ${global.i18n.t('baidu_pan_upload_success')}`)

    if (settingState.setting['download.deleteLocalAfterUpload']) {
      await unlink(item.filePath).catch(() => {})
      await saveList(downloadState.list.filter((row) => row.id != item.id))
    }
  } catch (err: any) {
    const code = err instanceof BaiduPanError ? err.code : -1
    dlog('pan', '上传失败', fileName, 'code=' + code, err?.message ?? err)
    const upload = { status: 'fail' as const, progress: 0, errorMsg: errnoToText(code) }
    updateTask(id, { upload })
    await saveItemUpload(item.id, upload)
    toast(`${fileName} ${global.i18n.t('baidu_pan_upload_failed')}：${errnoToText(code)}`, 'long')
  }
}

/** 手动上传某个已下载的条目到网盘（下载页用，本地保存的条目也能补传） */
export const uploadItemToPan = async(itemId: string) => {
  const item = downloadState.list.find((row) => row.id == itemId)
  if (!item) return
  await uploadToPan(item.id, item)
}

/** 重试上传（下载页用） */
export const retryUpload = async(itemId: string) => {
  const item = downloadState.list.find((row) => row.id == itemId)
  if (!item) return
  await uploadToPan(item.id, item)
}

export const clearTask = (id: string) => {
  downloadActions.removeTask(id)
}

/**
 * 下载完成后写入附加信息（1.23.0）
 *
 * - 标签 / 封面 / 内嵌歌词走 react-native-local-media-metadata 原生模块；
 * - 任一项失败只提示，不影响已下载的音频文件；
 * - 封面先下到临时文件，写完立刻删除，不在用户目录留垃圾。
 */
export const applyDownloadMetadata = async(options: {
  filePath: string
  baseName: string
  dir: string
  musicInfo: LX.Music.MusicInfoOnline
}) => {
  const { filePath, baseName, dir, musicInfo } = options
  const setting = settingState.setting
  const writeLrcFile = setting['download.writeLyric'] || setting['download.saveLrcFile']
  const needLyric = writeLrcFile || setting['download.writeEmbedLyric']
  if (!setting['download.writeMetadata'] && !setting['download.writePicture'] && !needLyric) return

  const failed: string[] = []
  const dirPath = dir.endsWith('/') ? dir : `${dir}/`

  if (setting['download.writeMetadata']) {
    try {
      // 部分音源会在音乐信息上带 alias（别名），类型里没有声明，这里按可选字段处理
      const alias = (musicInfo as unknown as { alias?: string | string[] }).alias
      const aliasText = Array.isArray(alias) ? alias.join(' / ') : alias
      const title = setting['download.writeAlias'] && aliasText
        ? `${musicInfo.name} (${aliasText})`
        : musicInfo.name
      await writeMetadata(filePath, {
        name: title,
        singer: musicInfo.singer ?? '',
        albumName: musicInfo.meta?.albumName ?? '',
      }, true)
    } catch {
      failed.push('标签')
    }
  }

  if (setting['download.writePicture']) {
    const picPath = `${privateStorageDirectoryPath}/temp_cover_${Date.now()}.jpg`
    try {
      const url = await getPicPath({ musicInfo })
      if (!url) throw new Error('no pic')
      const res = await RNFS.downloadFile({ fromUrl: url, toFile: picPath }).promise
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) throw new Error(`HTTP ${res.statusCode}`)
      await writePic(filePath, picPath)
    } catch {
      failed.push('封面')
    } finally {
      await RNFS.unlink(picPath).catch(() => {})
    }
  }

  if (needLyric) {
    try {
      const lyricInfo = await getLyricInfo({ musicInfo })
      let content = buildLyrics(
        lyricInfo as unknown as LX.Music.LyricInfo,
        false,
        !!lyricInfo.tlyric,
        !!setting['download.writeRomaLyric'],
      )
      // mod 版增强：优先写「逐字增强 LRC」（A2 绝对时间），可用设置里的「写逐字歌词」关闭；
      // 没有逐字源时按行时长均分兜底。上游渲染链路本身不认逐字，这里只影响落盘文件/内嵌歌词。
      if (setting['download.writeWordLyric']) {
        const raw = lyricInfo as unknown as { lyric?: string, lxlyric?: string }
        if (raw?.lyric) {
          const word = raw.lxlyric || buildAutoWordLyric(raw.lyric)
          const enhanced = word ? buildRawWordLyric(raw.lyric, word) : ''
          if (enhanced) content = enhanced
        }
      }
      if (!content) throw new Error('no lyric')
      if (setting['download.writeEmbedLyric']) await writeLyric(filePath, content)
      if (writeLrcFile) await RNFS.writeFile(`${dirPath}${baseName}.lrc`, content, 'utf8')
    } catch {
      failed.push('歌词')
    }
  }

  if (failed.length) toast(`附加信息写入失败：${failed.join('、')}`, 'long')
}

/**
 * 下载歌曲到 App 私有目录
 * @param quality 指定音质，不传则使用设置里的默认下载音质
 */
export const downloadMusic = async(
  musicInfo: LX.Music.MusicInfoOnline,
  quality: LX.Quality,
  options: { panDir?: string } = {},
): Promise<boolean> => {
  const id = buildItemId(musicInfo, quality)
  if (downloadState.list.some(item => item.id == id)) return true
  // waiting 也算进行中：worker 取到任务先置 waiting 再取链接，
  // 只挡 downloading 会让同一首歌在并发时被下载两次
  if (['waiting', 'downloading'].includes(downloadState.tasks[id]?.status)) return true

  updateTask(id, {
    id,
    status: 'waiting',
    progress: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
  })

  let url = ''
  // 实际生效的音质：音源对高档位请求失败时会按回退链降级，文件要以实际档位标注（1.22.16）
  let actualQuality: LX.Quality = quality
  try {
    url = await getMusicUrl({ musicInfo, quality, isRefresh: true, onQuality: q => { actualQuality = q } })
  } catch (err: any) {
    // getMusicUrl 内部已带升级场景的回退链，这里兜住其余失败场景再降一级尝试
    let lastErr: unknown = err
    let resolved = false
    for (const fallbackQuality of getQualityFallbacks(quality, musicInfo)) {
      try {
        url = await getMusicUrl({ musicInfo, quality: fallbackQuality, isRefresh: true, onQuality: q => { actualQuality = q } })
        resolved = true
        break
      } catch (chainErr) {
        lastErr = chainErr
      }
    }
    if (!resolved) {
      updateTask(id, { status: 'error', message: (lastErr as Error)?.message ?? 'get url failed' })
      return false
    }
  }

  let targetDir = await resolveDownloadDirectory()
  try {
    await ensureDir(targetDir)
  } catch {
    // 目录不可写（例如权限被系统回收）时回退到私有目录
    targetDir = privateDownloadDirectoryPath
    await ensureDir(targetDir)
  }
  const ext = fileExt(actualQuality)
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
    // 下载完成后按设置写入标签 / 封面 / 歌词（1.23.0；mod 版在其中补了逐字歌词）
    await applyDownloadMetadata({ filePath, baseName, dir: targetDir, musicInfo }).catch(() => {})
    // 写到公共目录（Download / SD 卡）的文件只是「存在」，MediaStore 不会自动感知。
    // 不主动通知，下载完成后「本地音乐」和第三方播放器都搜不到这首歌。
    if (!targetDir.startsWith(privateStorageDirectoryPath)) {
      // 扫描失败不影响下载结果，但必须 catch：否则原生 reject 会变成
      // unhandled promise rejection，Hermes 下会打红字甚至中断队列
      scanFile(filePath).catch(() => {})
    }
    const info = await stat(filePath).catch(() => null)
    // 指定了网盘目录（播放页「下载到网盘」）就强制走上传，忽略「保存位置」设置
    const saveTarget = options.panDir ? 'baiduPan' : settingState.setting['download.saveTarget'] ?? 'local'
    const item: LX.Download.ExtItem = {
      id,
      musicInfo,
      quality: actualQuality,
      filePath,
      fileName,
      ext,
      size: info?.size ?? 0,
      createdAt: Date.now(),
      panDir: options.panDir,
      upload: saveTarget == 'baiduPan' ? { status: 'uploading', progress: 0 } : undefined,
    }
    await saveList([item, ...downloadState.list])
    updateTask(id, { status: 'completed', progress: 100 })
    global.app_event.downloadListUpdate()

    if (saveTarget == 'baiduPan') {
      await uploadToPan(id, item)
    }
    setTimeout(() => { clearTask(id) }, 1200)
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
  const list = getAvailableQualities(musicInfo)
  return list[list.length - 1] ?? '320k'
}

/**
 * 本次下载要用的音质
 *
 * 设置里可选两种模式：
 * - 自动（默认）：逐首取这首歌可用的最高音质，与旧行为一致；
 * - 指定：统一使用「全局音质」。1.22.16 起不再用可用档位拦截——
 *   自定义音源声明普遍落后于实际能力（kw 未声明 master 但服务端能返回），
 *   直接按设置档位请求，失败时 downloadMusic 内部按回退链降级并以实际档位入列表。
 */
export const getDownloadQuality = (musicInfo: LX.Music.MusicInfoOnline): LX.Quality => {
  const mode = settingState.setting['download.qualityMode']
  if (mode != 'global') return getBestQuality(musicInfo)
  return settingState.setting['download.quality'] as LX.Quality
}

/**
 * 并发下载数量（1-5）
 */
export const getDownloadConcurrency = () => {
  const value = Number(settingState.setting['download.concurrency'])
  if (!Number.isFinite(value)) return 3
  return Math.min(5, Math.max(1, Math.round(value)))
}

/**
 * 一键下载一组歌曲（1.17.1）
 * - 自动跳过本地歌曲与已下载过的歌曲
 * - 不指定音质时逐首取「最高可用音质」
 * - 并发数量由设置「并发下载数量」控制（默认 3，避免同时开太多连接被音源限流）
 */
export const downloadMusics = async(musics: LX.Music.MusicInfo[], options: {
  quality?: LX.Quality
  onProgress?: (done: number, total: number) => void
} = {}): Promise<{ total: number, success: number, failed: number }> => {
  const downloadedIds = new Set(downloadState.list.map(item => item.musicInfo.id))
  // 同一首歌在歌单里可能出现多次，按 id 去重，避免并发重复下载
  const seenIds = new Set<string>()
  const targets = musics.filter((musicInfo) => {
    if (musicInfo.source == 'local') return false
    if (downloadedIds.has(musicInfo.id)) return false
    if (seenIds.has(musicInfo.id)) return false
    seenIds.add(musicInfo.id)
    return true
  }) as LX.Music.MusicInfoOnline[]

  const result = { total: targets.length, success: 0, failed: 0 }
  if (!targets.length) return result

  let cursor = 0
  let done = 0
  const worker = async() => {
    while (cursor < targets.length) {
      const musicInfo = targets[cursor++]
      const quality = options.quality ?? getDownloadQuality(musicInfo)
      const ok = await downloadMusic(musicInfo, quality).catch(() => false)
      if (ok) result.success++
      else result.failed++
      done++
      options.onProgress?.(done, targets.length)
    }
  }
  const limit = Math.min(getDownloadConcurrency(), targets.length)
  await Promise.all(Array.from({ length: limit }, worker))
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
