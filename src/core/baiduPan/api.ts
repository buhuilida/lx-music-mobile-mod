/**
 * 百度网盘网页版接口封装（Cookie + bdstoken）
 *
 * 非官方接口，百度随时可能调整参数或加风控，所以：
 * - 所有端点集中在这里，出问题只改这一处；
 * - errno 全部映射成中文提示；
 * - Cookie 属于账号凭证，不打印 Cookie 内容。
 */
import { loadBaiduPanAuth, clearBaiduPanAuth, type BaiduPanAuth } from './auth'
import { log } from '@/utils/log'
import { dlog } from '@/utils/debugLog'

export const COMMON_QUERY = 'clienttype=0&app_id=250528&web=1&channel=chunlei'
const PAN_HOST = 'https://pan.baidu.com'
const PCS_HOST = 'https://d.pcs.baidu.com'

/** 固定 4MB 分片，这是百度网页版上传的硬要求 */
export const BLOCK_SIZE = 4 * 1024 * 1024
/** slice-md5 取文件前 256KB */
export const SLICE_SIZE = 256 * 1024

export class BaiduPanError extends Error {
  code: number
  constructor(code: number, message?: string) {
    super(message ?? `baidu pan error ${code}`)
    this.name = 'BaiduPanError'
    this.code = code
  }
}

export const isAuthError = (code: number) => code === -6 || code === 4 || code === 31045

/**
 * errno → i18n key。返回 key 而不是文案，方便三语切换。
 */
export const errnoToI18nKey = (errno: number): string => {
  switch (errno) {
    case -6: return 'baidu_pan_err_not_login'
    case -9: return 'baidu_pan_err_cookie_expired'
    case 4: return 'baidu_pan_err_not_login'
    case 31023: return 'baidu_pan_err_param'
    case 31066: return 'baidu_pan_err_no_space'
    case 111: return 'baidu_pan_err_file_name'
    case -1: return 'baidu_pan_err_network'
    default: return 'baidu_pan_err_unknown'
  }
}

export const errnoToText = (errno: number): string => {
  const key = errnoToI18nKey(errno)
  return global.i18n ? global.i18n.t(key as any, { code: errno }) : `${key}(${errno})`
}

const ensureAuth = async (): Promise<BaiduPanAuth> => {
  const auth = await loadBaiduPanAuth()
  if (!auth) throw new BaiduPanError(-6)
  return auth
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  return Object.keys(params)
    .filter((key) => params[key] != null && params[key] !== '')
    .map((key) => `${key}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

const buildForm = (params: Record<string, string | number | undefined>) => {
  return buildQuery(params)
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  form?: Record<string, string | number | undefined>
  /** 直接给定 body（上传分片用二进制） */
  body?: any
  headers?: Record<string, string>
  /** 不解析 JSON（上传分片返回也解析，这里保留扩展位） */
  raw?: boolean
}

const request = async (url: string, options: RequestOptions = {}): Promise<any> => {
  const auth = await ensureAuth()
  const headers: Record<string, string> = {
    Cookie: auth.cookie,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://pan.baidu.com/disk/home',
    ...options.headers,
  }
  let body = options.body
  if (options.form) {
    body = buildForm(options.form)
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  // 只记录端点名，不带 Cookie / 参数，避免凭证进日志
  const endpoint = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
  const startedAt = Date.now()
  let res: any
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
    })
  } catch (err: any) {
    log.error('[百度网盘] 请求异常: ' + (err?.message ?? String(err)))
    throw new BaiduPanError(-1)
  }

  if (!res.ok) {
    dlog('pan', '接口 HTTP 异常', endpoint, 'status=' + res.status, (Date.now() - startedAt) + 'ms')
    // 风控时百度会返回 403 / 302，统一按网络异常处理
    throw new BaiduPanError(-1, `HTTP ${res.status}`)
  }

  let json: any
  try {
    json = await res.json()
  } catch {
    dlog('pan', '接口返回非 JSON', endpoint, (Date.now() - startedAt) + 'ms')
    throw new BaiduPanError(-1, 'invalid json')
  }
  dlog('pan', '接口返回', endpoint, 'errno=' + (json?.errno ?? 'none'), (Date.now() - startedAt) + 'ms')
  return json
}

/** 统一校验 errno；登录类错误顺手清空本地凭证 */
const checkErrno = async (body: any) => {
  const errno = Number(body?.errno ?? 0)
  if (errno === 0) return body
  log.warn(`[百度网盘] 接口返回 errno=${errno}`)
  if (isAuthError(errno)) await clearBaiduPanAuth()
  throw new BaiduPanError(errno)
}

export interface PanFile {
  fs_id: number
  path: string
  name: string
  isdir: boolean
  size: number
  server_mtime: number
}

export type PanSortField = 'name' | 'time'

/** 列目录（任意路径，不受 /apps 限制）；order: name 按名称 / time 按修改时间 */
export const listDir = async (dir: string, order: PanSortField = 'name', desc = 0): Promise<PanFile[]> => {
  const auth = await ensureAuth()
  const query = buildQuery({
    order: order === 'time' ? 'time' : 'name',
    desc,
    showempty: 0,
    web: 1,
    page: 1,
    num: 1000,
    dir,
    bdstoken: auth.bdstoken,
    clienttype: 0,
    app_id: 250528,
    channel: 'chunlei',
  })
  const body = await request(`${PAN_HOST}/api/list?${query}`)
  await checkErrno(body)
  const raw = (body.list ?? []) as any[]
  dlog('pan', '列目录', dir, '共 ' + raw.length + ' 项', '目录 ' + raw.filter((i) => i.isdir).length + ' 个')
  return raw.map((item) => ({
    fs_id: item.fs_id,
    path: item.path,
    name: item.server_filename,
    isdir: !!item.isdir,
    size: Number(item.size ?? 0),
    server_mtime: Number(item.server_mtime ?? 0),
  }))
}

/** 删除文件 / 文件夹（递归） */
export const deleteFiles = async (paths: string[]): Promise<void> => {
  if (!paths.length) return
  const auth = await ensureAuth()
  const query = buildQuery({ opera: 'delete', bdstoken: auth.bdstoken, clienttype: 0, app_id: 250528, web: 1, channel: 'chunlei' })
  const body = await request(`${PAN_HOST}/api/filemanager?${query}`, {
    method: 'POST',
    form: {
      filelist: JSON.stringify(paths),
      async: 1,
      ondup: 'fail',
    },
  })
  await checkErrno(body)
}

/** 新建文件夹 */
export const createDir = async (path: string): Promise<void> => {
  const auth = await ensureAuth()
  const query = buildQuery({ bdstoken: auth.bdstoken, clienttype: 0, app_id: 250528, web: 1, channel: 'chunlei' })
  const body = await request(`${PAN_HOST}/api/create?${query}`, {
    method: 'POST',
    form: {
      path,
      isdir: 1,
      size: 0,
      block_list: '[]',
      rtype: 3,
    },
  })
  await checkErrno(body)
}

export interface PrecreateResult {
  uploadid: string
  /** 需要实际上传的分片序号；秒传命中时为空 */
  blockList: number[]
  /** 2 表示秒传命中 */
  returnType: number
  /** 服务端已存在相同文件时的提示 */
  rapidUpload: boolean
}

/** ① 预创建 */
export const precreate = async (params: {
  path: string
  size: number
  blockList: string[]
  sliceMd5: string
  contentMd5: string
}): Promise<PrecreateResult> => {
  const auth = await ensureAuth()
  const query = buildQuery({ bdstoken: auth.bdstoken, clienttype: 0, app_id: 250528, web: 1, channel: 'chunlei' })
  const body = await request(`${PAN_HOST}/api/precreate?${query}`, {
    method: 'POST',
    form: {
      path: params.path,
      size: params.size,
      isdir: 0,
      autoinit: 1,
      rtype: 3,
      block_list: JSON.stringify(params.blockList),
      'slice-md5': params.sliceMd5,
      'content-md5': params.contentMd5,
    },
  })
  await checkErrno(body)
  const returnType = Number(body.return_type ?? 1)
  const uploadid = String(body.uploadid ?? '')
  const rapid = returnType === 2 || !uploadid
  return {
    uploadid,
    // 服务端只要求补传缺失分片；没给就补全部
    blockList: Array.isArray(body.block_list) ? body.block_list.map(Number) : [],
    returnType,
    rapidUpload: rapid,
  }
}

/** ② 上传单个分片（body 必须是原始字节，不是 multipart） */
export const uploadSlice = async (params: {
  path: string
  uploadid: string
  partseq: number
  data: Uint8Array
}): Promise<void> => {
  const auth = await ensureAuth()
  const query = buildQuery({
    method: 'upload',
    app_id: 250528,
    path: params.path,
    uploadid: params.uploadid,
    partseq: params.partseq,
    type: 'tmp',
  })
  const body = await request(`${PCS_HOST}/rest/2.0/pcs/superfile2?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: params.data,
  })
  const errorCode = Number(body?.error_code ?? 0)
  if (errorCode !== 0) {
    if (isAuthError(errorCode)) await clearBaiduPanAuth()
    throw new BaiduPanError(errorCode)
  }
}

/** ③ 合并分片 */
export const createFile = async (params: {
  path: string
  size: number
  blockList: string[]
  uploadid: string
}): Promise<any> => {
  const auth = await ensureAuth()
  const query = buildQuery({
    a: 'commit',
    bdstoken: auth.bdstoken,
    clienttype: 0,
    app_id: 250528,
    web: 1,
    channel: 'chunlei',
  })
  const body = await request(`${PAN_HOST}/api/create?${query}`, {
    method: 'POST',
    form: {
      path: params.path,
      size: params.size,
      isdir: 0,
      block_list: JSON.stringify(params.blockList),
      uploadid: params.uploadid,
      rtype: 3,
    },
  })
  await checkErrno(body)
  return body
}
