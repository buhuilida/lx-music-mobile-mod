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
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

/**
 * 规范化服务器地址：补协议、去尾斜杠
 * 支持 https://dav.jianguoyun.com/dav/ 与 dav.jianguoyun.com/dav 两种写法
 */
export const normalizeWebdavUrl = (url: string) => {
  let serverUrl = url.trim()
  if (!serverUrl) return ''
  if (!/^https?:\/\//i.test(serverUrl)) serverUrl = `https://${serverUrl}`
  serverUrl = serverUrl.replace(/\/+$/, '')
  // 只留协议 + 主机 + 根路径，防止用户把文件路径也填进来
  return serverUrl
}

const authHeader = (config: WebDAVConfig) => {
  const token = global.btoa(`${config.user}:${config.password}`)
  return `Basic ${token}`
}

const REQUEST_TIMEOUT = 25_000

const request = async(config: WebDAVConfig, method: string, path: string, body?: string): Promise<{ status: number, text: string }> => {
  const base = normalizeWebdavUrl(config.url)
  if (!base) throw new WebDAVError('bad_url')
  const url = `${base}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(config),
        // PROPFIND 需要显式 Depth（部分服务器对 infinity 返回 400）
        ...(method === 'PROPFIND' ? { Depth: '0' } : {}),
        ...(body != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      },
      body,
      signal: controller.signal,
    } as RequestInit)
  } catch (err) {
    const message = (err as Error).message ?? ''
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
  if (status === 401 || status === 403) throw new WebDAVError('auth_failed')
  if (status === 404) throw new WebDAVError('not_found')
  if (status === 501 || status === 405) {
    // 服务器不支持 PROPFIND，退回 GET 验证；目录 GET 收到 405 也说明认证与路径均正常
    const { status: getStatus } = await request(config, 'GET', '/')
    if (getStatus === 200 || getStatus === 207 || getStatus === 405) return
    if (getStatus === 401 || getStatus === 403) throw new WebDAVError('auth_failed')
    if (getStatus === 404) throw new WebDAVError('not_found')
    throw new WebDAVError('server_error', `HTTP ${getStatus}`)
  }
  throw new WebDAVError('server_error', `HTTP ${status}`)
}

/**
 * 确保备份目录存在（405 = 已存在，视为成功）
 */
const ensureDir = async(config: WebDAVConfig, dir: string) => {
  const { status } = await request(config, 'MKCOL', `/${dir}`)
  if (status >= 200 && status < 300) return
  if (status === 405 || status === 301) return
  // 部分服务不允许 MKCOL 多级路径，逐级建
  if (status === 409) {
    const segments = dir.split('/').filter(Boolean)
    let built = ''
    for (const segment of segments) {
      built += `/${segment}`
      const r = await request(config, 'MKCOL', built)
      if (!(r.status >= 200 && r.status < 300) && r.status !== 405) {
        throw new WebDAVError('mkcol_failed', `HTTP ${r.status}`)
      }
    }
    return
  }
  throw new WebDAVError('mkcol_failed', `HTTP ${status}`)
}

export const putFile = async(config: WebDAVConfig, name: string, content: string) => {
  await ensureDir(config, DIR_NAME)
  const { status } = await request(config, 'PUT', `/${DIR_NAME}/${name}`, content)
  if (!(status >= 200 && status < 300)) throw new WebDAVError('put_failed', `HTTP ${status}`)
}

export const getFile = async(config: WebDAVConfig, name: string): Promise<string> => {
  const { status, text } = await request(config, 'GET', `/${DIR_NAME}/${name}`)
  if (status === 404) throw new WebDAVError('no_backup')
  if (!(status >= 200 && status < 300)) throw new WebDAVError('get_failed', `HTTP ${status}`)
  return text
}
