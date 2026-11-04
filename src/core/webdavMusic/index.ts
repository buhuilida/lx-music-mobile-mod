/**
 * WebDAV 音乐库（云盘）
 *
 * 与「数据同步 → WebDAV 备份」共用同一份服务器配置，但用途不同：
 * 这里是把网盘当音乐库，浏览目录、扫描音频、直接播放。
 *
 * 只用 PROPFIND 一个方法（Depth: 1），不依赖 webdav npm 包。
 */
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'
import { normalizeWebdavUrl, encodeBase64 } from '@/core/sync/webdav'

export interface WebDAVFolder {
  /** 目录名 */
  name: string
  /** 相对服务器根目录的路径，形如 /Music/周杰伦 */
  path: string
}

export interface WebDAVSong {
  id: string
  name: string
  singer: string
  /** 相对路径，播放时拼到服务器地址后面 */
  remotePath: string
  fileName: string
  size: number
  lastModified: number
  ext: string
}

interface WebDAVStore {
  songs: WebDAVSong[]
  scannedAt: number
  rootPath: string
  /** 扫描时的服务器地址：换了服务器后旧路径全部失效，需要重新扫描 */
  serverUrl?: string
  /** 撞到 MAX_FILES 上限被截断 */
  truncated?: boolean
  /** 读取失败的子目录数（限流 / 网络抖动），曲库可能不全 */
  failedDirs?: number
}

const STORE_KEY = '@webdav_music_library'
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'ape'])
const MAX_DEPTH = 8
const MAX_FILES = 5000
const TIMEOUT = 20_000
/** 目录请求遇到限流 / 网关错误时的重试次数（坚果云每 30 分钟只给 600 次请求） */
const MAX_RETRY = 3
/** 播放地址（可能带临时签名）的缓存时长，短于 S3 预签名的 1 小时 */
const PLAY_URL_TTL = 5 * 60 * 1000

export const getWebDAVServer = () => {
  const setting = settingState.setting
  return {
    url: normalizeWebdavUrl(setting['sync.webdavUrl']),
    user: setting['sync.webdavUser'] ?? '',
    password: setting['sync.webdavPassword'] ?? '',
  }
}

export const isWebDAVConfigured = () => {
  const { url, user } = getWebDAVServer()
  return !!url && !!user
}

/** 播放时需要给播放器带上的认证头 */
export const getWebDAVAuthHeader = () => {
  const { user, password } = getWebDAVServer()
  if (!user) return null
  return `Basic ${encodeBase64(`${user}:${password}`)}`
}

/** 服务器地址里的路径部分，例如 https://dav.jianguoyun.com/dav → /dav */
const getBasePath = () => {
  const { url } = getWebDAVServer()
  const matched = /^https?:\/\/[^/]+(\/.*)?$/i.exec(url)
  return (matched?.[1] ?? '').replace(/\/+$/, '')
}

/**
 * 判断两个地址是否同源（协议 + 主机 + 端口）。
 *
 * 这里不用 `new URL()`：RN 的核心库没有把 URL 注册成全局对象，部分 Hermes
 * 版本上直接 `new URL()` 会抛错，一旦抛错就会被判定成「不同源」，
 * 结果是把该带的认证头也剥掉，坚果云这类全程同源的服务器反而播不了。
 */
const ORIGIN_RXP = /^(https?):\/\/([^/?#]+)/i
export const isSameOrigin = (a: string, b: string) => {
  const ma = ORIGIN_RXP.exec(a ?? '')
  const mb = ORIGIN_RXP.exec(b ?? '')
  if (!ma || !mb) return false
  return ma[1].toLowerCase() == mb[1].toLowerCase() && ma[2].toLowerCase() == mb[2].toLowerCase()
}

const encodePath = (path: string) => path.split('/').map(segment => encodeURIComponent(segment)).join('/')

/** 直接可播放的完整地址（不含认证信息） */
export const getWebDAVStreamUrl = (song: { remotePath: string }) => {
  const { url } = getWebDAVServer()
  if (!url) return ''
  const remote = song.remotePath.startsWith('/') ? song.remotePath : `/${song.remotePath}`
  return `${url}${encodePath(remote)}`
}

const emptyStore = (): WebDAVStore => ({ songs: [], scannedAt: 0, rootPath: '/' })

export const getWebDAVStore = async(): Promise<WebDAVStore> => {
  const store = await getData<WebDAVStore>(STORE_KEY)
  if (!store?.songs) return emptyStore()
  // 换了服务器地址后，曲库里存的全是旧服务器路径，播出去只会 404
  const { url } = getWebDAVServer()
  if (store.serverUrl && url && store.serverUrl != url) return emptyStore()
  return { ...emptyStore(), ...store, songs: store.songs }
}

const saveStore = async(store: WebDAVStore) => {
  await saveData(STORE_KEY, store)
}

const decodeEntities = (text: string) => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
  .replace(/&amp;/g, '&')

const TAG = '(?:[a-zA-Z0-9]+:)?'

interface PropfindEntry {
  href: string
  isDir: boolean
  size: number
  lastModified: number
  displayName: string
}

const parsePropfind = (xml: string): PropfindEntry[] => {
  const entries: PropfindEntry[] = []
  const responseRxp = new RegExp(`<${TAG}response\\b[^>]*>([\\s\\S]*?)</${TAG}response>`, 'gi')
  let matched: RegExpExecArray | null
  while ((matched = responseRxp.exec(xml))) {
    const block = matched[1]
    const hrefMatch = new RegExp(`<${TAG}href\\b[^>]*>([\\s\\S]*?)</${TAG}href>`, 'i').exec(block)
    if (!hrefMatch) continue
    let href = decodeEntities(hrefMatch[1].trim())
    try { href = decodeURIComponent(href) } catch {}
    const sizeMatch = new RegExp(`<${TAG}getcontentlength\\b[^>]*>(\\d+)</${TAG}getcontentlength>`, 'i').exec(block)
    const modMatch = new RegExp(`<${TAG}getlastmodified\\b[^>]*>([^<]+)</${TAG}getlastmodified>`, 'i').exec(block)
    const nameMatch = new RegExp(`<${TAG}displayname\\b[^>]*>([\\s\\S]*?)</${TAG}displayname>`, 'i').exec(block)
    entries.push({
      href,
      // collection 标签出现即目录；部分服务器不返回 resourcetype，用结尾斜杠兜底
      isDir: new RegExp(`<${TAG}collection\\b`, 'i').test(block) || href.endsWith('/'),
      size: sizeMatch ? Number(sizeMatch[1]) : 0,
      lastModified: modMatch ? new Date(modMatch[1]).getTime() || 0 : 0,
      displayName: nameMatch ? decodeEntities(nameMatch[1].trim()) : '',
    })
  }
  return entries
}

/** 把服务器返回的 href 归一成相对路径 */
const toRelativePath = (href: string) => {
  let path = href
  // 部分服务器（Alist、nginx alias）返回的是绝对地址 https://host/dav/x.mp3，
  // 直接当路径用会拼出 `/https://...` 这种必 404 的地址
  const absolute = /^https?:\/\/[^/]+(\/.*)?$/i.exec(path)
  if (absolute) path = absolute[1] ?? '/'
  const basePath = getBasePath()
  if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length)
  if (!path.startsWith('/')) path = `/${path}`
  // 去掉结尾斜杠，根目录除外
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

const sleep = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms) })

/** 这些状态码说明是「服务器临时抽风」，值得重试；4xx 重试没有意义 */
const isRetryable = (message: string) => (
  message == 'WEBDAV_BUSY' ||
  message == 'WEBDAV_TIMEOUT' ||
  message == 'Network request failed' ||
  /Network request failed/i.test(message) ||
  /^WEBDAV_HTTP_5\d\d$/.test(message)
)

const propfindOnce = async(path: string): Promise<PropfindEntry[]> => {
  const { url, user, password } = getWebDAVServer()
  if (!url) throw new Error('WEBDAV_NOT_CONFIGURED')
  const target = `${url}${encodePath(path.startsWith('/') ? path : `/${path}`)}`
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT)
  try {
    const response = await fetch(target, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${encodeBase64(`${user}:${password}`)}`,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>',
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new Error('WEBDAV_AUTH_FAILED')
    if (response.status === 404) throw new Error('WEBDAV_NOT_FOUND')
    // 坚果云「请求过于频繁」返回 503，与普通 5xx 区分开，方便提示用户
    if (response.status === 503 || response.status === 429) throw new Error('WEBDAV_BUSY')
    if (response.status >= 400) throw new Error(`WEBDAV_HTTP_${response.status}`)
    return parsePropfind(await response.text())
  } catch (err) {
    const message = (err as Error)?.message ?? ''
    if (/abort/i.test(message)) throw new Error('WEBDAV_TIMEOUT')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * PROPFIND 带重试。
 *
 * 坚果云免费账号限制「每 30 分钟 600 次请求」，递归扫描目录多的时候很容易撞上
 * 503；原来直接抛错，表现为扫描到一半失败、曲库不全。
 */
const propfind = async(path: string): Promise<PropfindEntry[]> => {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      return await propfindOnce(path)
    } catch (err) {
      lastError = err as Error
      const message = lastError?.message ?? ''
      if (attempt == MAX_RETRY - 1 || !isRetryable(message)) break
      // 400ms → 1200ms → 2600ms，避开瞬时峰值
      await sleep(400 * Math.pow(3, attempt))
    }
  }
  throw lastError ?? new Error('WEBDAV_HTTP_0')
}

const buildFolder = (entry: PropfindEntry, currentPath: string): WebDAVFolder | null => {
  const path = toRelativePath(entry.href)
  if (path == currentPath) return null
  const fallbackName = path.split('/').filter(Boolean).pop()
  const name = entry.displayName !== '' ? entry.displayName : (fallbackName ?? path)
  return { name, path }
}

const toSong = (entry: PropfindEntry): WebDAVSong | null => {
  const remotePath = toRelativePath(entry.href)
  const fallbackName = remotePath.split('/').filter(Boolean).pop()
  const fileName = entry.displayName !== '' ? entry.displayName : (fallbackName ?? remotePath)
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  if (!AUDIO_EXTS.has(ext)) return null
  const rawName = fileName.slice(0, fileName.length - ext.length - 1).trim()
  const parts = rawName.split('-')
  const name = (parts[0] ?? rawName).trim()
  const singer = parts.length > 1 ? parts.slice(1).join('-').trim() : ''
  return {
    id: `webdav_${remotePath}`,
    name: name || rawName,
    singer,
    remotePath,
    fileName,
    size: entry.size,
    lastModified: entry.lastModified,
    ext,
  }
}

/**
 * 一次 PROPFIND 同时返回子目录与音频。
 *
 * 页面原先分别调 listWebDAVFolders 和 listWebDAVSongs，同一目录要发两次
 * 请求；坚果云有「30 分钟 600 次」的限流，浏览几十个目录就会撞 503。
 */
export const listWebDAVDirectory = async(path = '/'): Promise<{ folders: WebDAVFolder[], songs: WebDAVSong[] }> => {
  const entries = await propfind(path)
  const folders = entries
    .filter(entry => entry.isDir)
    .map(entry => buildFolder(entry, path))
    .filter((item): item is WebDAVFolder => !!item)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const songs = entries
    .filter(entry => !entry.isDir)
    .map(entry => toSong(entry))
    .filter((item): item is WebDAVSong => !!item)
  return { folders, songs }
}

/** 列出某个目录下的子目录（根目录传 /） */
export const listWebDAVFolders = async(path = '/'): Promise<WebDAVFolder[]> => {
  return (await listWebDAVDirectory(path)).folders
}

/** 只列当前目录的音频（不递归） */
export const listWebDAVSongs = async(path = '/'): Promise<WebDAVSong[]> => {
  return (await listWebDAVDirectory(path)).songs
}

/** 递归扫描：把一个目录下的所有音频都收进来 */
export const scanWebDAVSongs = async(
  path: string,
  onProgress?: (count: number, path: string) => void,
): Promise<WebDAVStore> => {
  const songs: WebDAVSong[] = []
  let failedDirs = 0
  const walk = async(current: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || songs.length >= MAX_FILES) return
    let entries: PropfindEntry[]
    try {
      entries = await propfind(current)
    } catch {
      failedDirs++
      // 单个子目录失败只跳过该目录；顶层失败直接抛错，避免网络断开时
      // 用空结果覆盖掉之前扫描好的曲库
      if (depth == 0) throw new Error('WEBDAV_SCAN_FAILED')
      return
    }
    for (const entry of entries) {
      if (songs.length >= MAX_FILES) return
      if (entry.isDir) {
        const folder = buildFolder(entry, current)
        if (folder) await walk(folder.path, depth + 1)
        continue
      }
      const song = toSong(entry)
      if (song) songs.push(song)
    }
    onProgress?.(songs.length, current)
  }
  await walk(path, 0)
  songs.sort((a, b) => a.remotePath.localeCompare(b.remotePath, 'zh-Hans-CN'))
  const store: WebDAVStore = {
    songs,
    scannedAt: Date.now(),
    rootPath: path,
    serverUrl: getWebDAVServer().url,
    // 撞上限和目录失败都会让曲库「看起来正常但其实少了歌」，必须让用户知道
    truncated: songs.length >= MAX_FILES,
    failedDirs,
  }
  await saveStore(store)
  if (failedDirs > 0 && songs.length == 0) throw new Error('WEBDAV_SCAN_FAILED')
  return store
}

export const clearWebDAVSongs = async() => {
  await saveStore(emptyStore())
}

/** 把云盘歌曲转成播放器认识的本地音乐结构 */
export const toLocalMusicInfo = (song: WebDAVSong): LX.Music.MusicInfoLocal => ({
  id: song.id,
  name: song.name,
  singer: song.singer,
  source: 'local',
  interval: null,
  meta: {
    songId: song.remotePath,
    albumName: '',
    filePath: song.remotePath,
    ext: song.ext,
    webdav: true,
    remotePath: song.remotePath,
  },
})

/** 播放地址缓存：直链 → 跳转后的最终地址（预签名地址 1 小时过期，这里只缓存 5 分钟） */
const playUrlCache = new Map<string, { url: string, expiresAt: number }>()

/** HEAD 探测，拿到 302 之后的最终地址 */
const probePlayUrl = async(direct: string, auth: string): Promise<string> => {
  const controller = new AbortController()
  // 探测发生在「点了播放到真正出声」的路径上，超时设短一点：
  // 探测失败只是退回直链，不该让用户多等
  const timer = setTimeout(() => { controller.abort() }, 5000)
  try {
    const response = await fetch(direct, {
      method: 'HEAD',
      headers: { Authorization: auth },
      signal: controller.signal,
    })
    // RN 的 fetch 走 OkHttp，response.url 是跟随跳转后的最终地址；
    // 预签名地址对 HEAD 会返回 403（签名含 GET 方法），但地址本身仍然有效
    return response.url || direct
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 解析出真正交给播放器的地址。
 *
 * 不少网盘（如 pan.cdn.ad）对文件 GET 会 302 到对象存储的预签名地址。
 * media3 的 DefaultHttpDataSource 跟随跳转时会把 setDefaultRequestProperties
 * 里的 Authorization 原样带到新主机，S3 同时收到「Basic 认证 + 预签名」两套
 * 凭证会直接返回 400：
 *   Only one auth mechanism allowed; only one of the X-Amz-Algorithm query
 *   parameter, Signature query string parameter or the Authorization header
 *   should be specified
 * 表现就是「目录能浏览、点播放一直失败」。
 *
 * 所以这里自己先把跳转跟到底，拿到最终地址；该地址已经自带签名，
 * 播放时不能再带 Authorization（判断逻辑见 plugins/player/playList.ts）。
 */
export const resolveWebDAVPlaySource = async(remotePath: string, force = false): Promise<string> => {
  const direct = getWebDAVStreamUrl({ remotePath })
  if (!direct) throw new Error('WEBDAV_NOT_CONFIGURED')
  const auth = getWebDAVAuthHeader()
  if (!auth) return direct

  const cached = playUrlCache.get(direct)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.url

  let url = direct
  try {
    url = await probePlayUrl(direct, auth)
  } catch {
    // 探测失败（超时 / 断网）就退回直链，让播放器照常报错，不吞掉播放流程
  }

  if (playUrlCache.size > 200) playUrlCache.clear()
  playUrlCache.set(direct, { url, expiresAt: Date.now() + PLAY_URL_TTL })
  return url
}
