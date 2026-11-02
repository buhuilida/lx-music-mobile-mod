/**
 * 极简 WebDAV 客户端
 *
 * 用于「数据同步 → WebDAV 备份」：把歌单 / 设置 / 自定义源脚本备份到
 * 坚果云、InfiniCloud、Alist 或任何标准 WebDAV 服务。
 * 只用到 MKCOL / PUT / GET / PROPFIND 四个方法，不做目录浏览等复杂能力。
 */

const DIR_NAME = 'lx-music-mod-sync'

export interface WebDAVConfig {
  url: string
  user: string
  password: string
}

export class WebDAVError extends Error {
  code: string
  status: number
  constructor(code: string, message?: string, status = 0) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

/**
 * 规范化服务器地址：补协议、去尾斜杠
 * 支持 https://dav.jianguoyun.com/dav/ 与 dav.jianguoyun.com/dav 两种写法
 */
export const normalizeWebdavUrl = (url: string) => {
  let serverUrl = (url ?? '').trim()
  if (!serverUrl) return ''
  if (!/^https?:\/\//i.test(serverUrl)) serverUrl = `https://${serverUrl}`
  serverUrl = serverUrl.replace(/\/+$/, '')
  return serverUrl
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 纯 JS 的 UTF-8 → base64（最后兜底，不依赖任何原生模块） */
const fallbackBase64 = (input: string): string => {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i)
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        code = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000
        i++
      }
    }
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    } else if (code < 0x10000) {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    } else {
      bytes.push(
        0xF0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3F),
        0x80 | ((code >> 6) & 0x3F),
        0x80 | (code & 0x3F),
      )
    }
  }
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    const b3 = bytes[i + 2]
    result += BASE64_CHARS[b1 >> 2]
    result += BASE64_CHARS[((b1 & 0x03) << 4) | ((b2 ?? 0) >> 4)]
    result += b2 == null ? '=' : BASE64_CHARS[((b2 & 0x0F) << 2) | ((b3 ?? 0) >> 6)]
    result += b3 == null ? '=' : BASE64_CHARS[b3 & 0x3F]
  }
  return result
}

/**
 * Base64 编码（用于 HTTP Basic 认证）
 *
 * 注意：React Native 的 JS 运行时（Hermes）**没有** global.btoa，
 * 之前的实现直接调用 global.btoa，导致每次请求都在 fetch 之前抛
 * TypeError，被 catch 后统一报成「网络错误」——这是 WebDAV 一直
 * 提示网络错误的根本原因。这里改为 Buffer（shim.js 注入）→ 纯 JS 兜底。
 */
export const encodeBase64 = (input: string): string => {
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(input, 'utf8').toString('base64')
    }
  } catch {}
  try {
    // btoa 只支持 Latin-1，密码含中文时会抛错，需要先转 UTF-8
    if (typeof global.btoa === 'function') {
      return global.btoa(unescape(encodeURIComponent(input)))
    }
  } catch {}
  return fallbackBase64(input)
}

const authHeader = (config: WebDAVConfig) => {
  return `Basic ${encodeBase64(`${config.user}:${config.password}`)}`
}

const REQUEST_TIMEOUT = 25_000

/** 把 HTTP 状态码翻译成可提示的错误码 */
const statusToError = (status: number, action: string): WebDAVError => {
  if (status === 401 || status === 403) return new WebDAVError('auth_failed', `HTTP ${status}`, status)
  if (status === 404) return new WebDAVError(action == 'get' ? 'no_backup' : 'not_found', `HTTP ${status}`, status)
  if (status === 507) return new WebDAVError('no_space', `HTTP ${status}`, status)
  return new WebDAVError('server_error', `HTTP ${status}`, status)
}

const request = async(config: WebDAVConfig, method: string, path: string, body?: string): Promise<{ status: number, text: string }> => {
  const base = normalizeWebdavUrl(config.url)
  if (!base) throw new WebDAVError('bad_url')
  const url = `${base}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, REQUEST_TIMEOUT)
  let response: Response
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: authHeader(config),
        // PROPFIND 需要显式 Depth（部分服务器对 infinity 返回 400）
        ...(method === 'PROPFIND' ? { Depth: '0' } : {}),
        ...(body != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      },
      body,
      signal: controller.signal,
      // 部分网盘（如本项目的 pan.cdn.ad）GET 会 302 跳到对象存储的临时地址
      redirect: 'follow',
    }
    response = await fetch(url, init)
  } catch (err) {
    const message = (err as Error)?.message ?? ''
    throw new WebDAVError('network', /abort/i.test(message) ? 'request timeout' : message)
  } finally {
    clearTimeout(timer)
  }
  let text = ''
  try { text = await response.text() } catch {}
  return { status: response.status, text }
}

/**
 * 测试连接：PROPFIND 根目录（Depth: 0），不支持时退回 GET。
 * 注意：Cloudreve 等服务不允许 GET 目录（HTTP 405），认证已通过时也返回 405，应视为连接正常。
 */
export const testConnection = async(config: WebDAVConfig) => {
  if (!normalizeWebdavUrl(config.url)) throw new WebDAVError('bad_url')
  if (!config.user || !config.password) throw new WebDAVError('bad_auth')
  const { status } = await request(config, 'PROPFIND', '/', undefined)
  // 207 Multi-Status 为 WebDAV 标准成功码；404/401/403 单独提示
  if (status === 207 || status === 200) return
  if (status === 401 || status === 403) throw statusToError(status, 'test')
  if (status === 404) throw statusToError(status, 'test')
  if (status === 501 || status === 405 || status === 400) {
    // 服务器不支持 PROPFIND，退回 GET 验证；目录 GET 收到 405 也说明认证与路径均正常
    const { status: getStatus } = await request(config, 'GET', '/')
    if (getStatus === 200 || getStatus === 207 || getStatus === 206 || getStatus === 405) return
    throw statusToError(getStatus, 'test')
  }
  throw statusToError(status, 'test')
}

/**
 * 确保备份目录存在（405 = 已存在，视为成功）
 */
const ensureDir = async(config: WebDAVConfig, dir: string) => {
  const { status } = await request(config, 'MKCOL', `/${dir}`)
  if (status >= 200 && status < 300) return
  if (status === 405 || status === 301 || status === 302) return
  // 部分服务不允许 MKCOL 多级路径，逐级建
  if (status === 409) {
    const segments = dir.split('/').filter(Boolean)
    let built = ''
    for (const segment of segments) {
      built += `/${segment}`
      const r = await request(config, 'MKCOL', built)
      if (!(r.status >= 200 && r.status < 300) && r.status !== 405 && r.status !== 301) {
        throw new WebDAVError('mkcol_failed', `HTTP ${r.status}`, r.status)
      }
    }
    return
  }
  throw statusToError(status, 'mkcol')
}

export const putFile = async(config: WebDAVConfig, name: string, content: string) => {
  await ensureDir(config, DIR_NAME)
  const { status } = await request(config, 'PUT', `/${DIR_NAME}/${name}`, content)
  if (!(status >= 200 && status < 300)) throw statusToError(status, 'put')
}

export const getFile = async(config: WebDAVConfig, name: string): Promise<string> => {
  const { status, text } = await request(config, 'GET', `/${DIR_NAME}/${name}`)
  if (status === 404) throw new WebDAVError('no_backup', 'HTTP 404', status)
  if (!(status >= 200 && status < 300)) throw statusToError(status, 'get')
  // 某些服务在 302 后返回 HTML 提示页，这里给出更明确的错误
  if (/^\s*</.test(text) && !/^\s*\{/.test(text)) {
    throw new WebDAVError('bad_response', 'server returned html instead of json')
  }
  return text
}
