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
}

const STORE_KEY = '@webdav_music_library'
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'ape'])
const MAX_DEPTH = 8
const MAX_FILES = 5000
const TIMEOUT = 20_000

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
const toRelativePath = (href: string, requestPath: string) => {
  let path = href
  const basePath = getBasePath()
  if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length)
  if (!path.startsWith('/')) path = `/${path}`
  // 去掉结尾斜杠，根目录除外
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

const propfind = async(path: string): Promise<PropfindEntry[]> => {
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

const buildFolder = (entry: PropfindEntry, currentPath: string): WebDAVFolder | null => {
  const path = toRelativePath(entry.href, currentPath)
  if (path == currentPath) return null
  const fallbackName = path.split('/').filter(Boolean).pop()
  const name = entry.displayName !== '' ? entry.displayName : (fallbackName ?? path)
  return { name, path }
}

/** 列出某个目录下的子目录（根目录传 /） */
export const listWebDAVFolders = async(path = '/'): Promise<WebDAVFolder[]> => {
  const entries = await propfind(path)
  return entries
    .filter(entry => entry.isDir)
    .map(entry => buildFolder(entry, path))
    .filter((item): item is WebDAVFolder => !!item)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

const toSong = (entry: PropfindEntry, currentPath: string): WebDAVSong | null => {
  const remotePath = toRelativePath(entry.href, currentPath)
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

/** 只列当前目录的音频（不递归） */
export const listWebDAVSongs = async(path = '/'): Promise<WebDAVSong[]> => {
  const entries = await propfind(path)
  return entries
    .filter(entry => !entry.isDir)
    .map(entry => toSong(entry, path))
    .filter((item): item is WebDAVSong => !!item)
}

/** 递归扫描：把一个目录下的所有音频都收进来 */
export const scanWebDAVSongs = async(
  path: string,
  onProgress?: (count: number, path: string) => void,
): Promise<WebDAVStore> => {
  const songs: WebDAVSong[] = []
  const walk = async(current: string, depth: number) => {
    if (depth > MAX_DEPTH || songs.length >= MAX_FILES) return
    let entries: PropfindEntry[]
    try {
      entries = await propfind(current)
    } catch {
      return
    }
    for (const entry of entries) {
      if (songs.length >= MAX_FILES) return
      if (entry.isDir) {
        const folder = buildFolder(entry, current)
        if (folder) await walk(folder.path, depth + 1)
        continue
      }
      const song = toSong(entry, current)
      if (song) songs.push(song)
    }
    onProgress?.(songs.length, current)
  }
  await walk(path, 0)
  songs.sort((a, b) => a.remotePath.localeCompare(b.remotePath, 'zh-Hans-CN'))
  const store: WebDAVStore = { songs, scannedAt: Date.now(), rootPath: path }
  await saveStore(store)
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
