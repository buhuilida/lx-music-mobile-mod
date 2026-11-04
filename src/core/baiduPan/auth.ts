/**
 * 百度网盘鉴权（网页版 Cookie → bdstoken）
 *
 * 不走开放平台：用户在打开的网页里登录 pan.baidu.com，我们读 Cookie（BDUSS 是 HttpOnly，
 * 只能用 CookieManager 读，document.cookie 拿不到），再用 Cookie 换 bdstoken，
 * 之后所有读写接口 = Cookie + bdstoken。好处是可以访问账号下的任意目录。
 *
 * 凭证保存在本地存储，等同账号凭证，日志一律脱敏。
 */
import { useEffect, useState } from 'react'
import CookieManager from '@react-native-cookies/cookies'

import { getData, saveData, removeData } from '@/plugins/storage'
import { log } from '@/utils/log'

const STORAGE_KEY = '@baidu_pan_auth'
const TEMPLATE_VARIABLE_API = 'https://pan.baidu.com/api/gettemplatevariable'
const COMMON_QUERY = 'clienttype=0&app_id=250528&web=1'

export interface BaiduPanAuth {
  /** 完整 Cookie 请求头（BDUSS / STOKEN / PANWEB=1 ...） */
  cookie: string
  bdstoken: string
  /** 用户 uid */
  uk: string
  savedAt: number
}

export class BaiduPanAuthError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'BaiduPanAuthError'
    this.code = code
  }
}

let auth: BaiduPanAuth | null = null
let loaded = false
const hooks: Array<(value: BaiduPanAuth | null) => void> = []

const notify = () => {
  for (const hook of hooks) hook(auth)
}

export const getBaiduPanAuth = () => auth
export const isBaiduPanLoggedIn = () => !!auth

export const loadBaiduPanAuth = async (): Promise<BaiduPanAuth | null> => {
  if (loaded) return auth
  loaded = true
  try {
    auth = await getData<BaiduPanAuth>(STORAGE_KEY)
  } catch (err: any) {
    log.error('[百度网盘] 读取登录信息失败: ' + (err?.message ?? String(err)))
    auth = null
  }
  notify()
  return auth
}

const setAuth = async (next: BaiduPanAuth | null) => {
  auth = next
  loaded = true
  try {
    if (next) await saveData(STORAGE_KEY, next)
    else await removeData(STORAGE_KEY)
  } catch (err: any) {
    log.error('[百度网盘] 保存登录信息失败: ' + (err?.message ?? String(err)))
  }
  notify()
}

export const clearBaiduPanAuth = async () => {
  await setAuth(null)
}

/** 订阅登录状态（用于设置页 / 目录选择页） */
export const useBaiduPanAuth = () => {
  const [value, setValue] = useState<BaiduPanAuth | null>(auth)
  useEffect(() => {
    hooks.push(setValue)
    void loadBaiduPanAuth()
    return () => {
      const index = hooks.indexOf(setValue)
      if (index > -1) hooks.splice(index, 1)
    }
  }, [])
  return value
}

/**
 * 规整 Cookie 字符串：去掉换行/多余分号，并补上网页版接口要求的 PANWEB=1
 */
export const normalizeCookie = (raw: string): string => {
  const map = new Map<string, string>()
  for (const part of raw.split(/[;\n\r]/)) {
    const item = part.trim()
    if (!item) continue
    const eq = item.indexOf('=')
    if (eq < 1) continue
    const key = item.slice(0, eq).trim()
    const value = item.slice(eq + 1).trim()
    if (key) map.set(key, value)
  }
  if (!map.size) throw new BaiduPanAuthError(-1, 'cookie empty')
  if (!map.has('PANWEB')) map.set('PANWEB', '1')
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
}

/** 用 Cookie 换 bdstoken / uk，失败说明 Cookie 无效 */
export const fetchBdstoken = async (cookie: string): Promise<{ bdstoken: string, uk: string }> => {
  const fields = encodeURIComponent(JSON.stringify(['bdstoken', 'token', 'uk', 'isdocuser', 'servertime']))
  const url = `${TEMPLATE_VARIABLE_API}?fields=${fields}&${COMMON_QUERY}`
  let body: any
  try {
    const res = await fetch(url, { headers: { Cookie: cookie } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.json()
  } catch (err: any) {
    log.error('[百度网盘] 换 bdstoken 请求失败: ' + (err?.message ?? String(err)))
    throw new BaiduPanAuthError(-1, 'network')
  }
  if (body?.errno !== 0 || !body?.result?.bdstoken) {
    throw new BaiduPanAuthError(body?.errno ?? -1, 'gettemplatevariable failed')
  }
  return {
    bdstoken: String(body.result.bdstoken),
    uk: String(body.result.uk ?? ''),
  }
}

/**
 * 用 Cookie 字符串登录（手动粘贴 / WebView 取到的 Cookie 都走这里）
 * 会先验证一次，成功才落库，避免存了个无效 Cookie
 */
export const loginWithCookie = async (rawCookie: string): Promise<BaiduPanAuth> => {
  if (!rawCookie || !/BDUSS=/.test(rawCookie)) throw new BaiduPanAuthError(-1, 'cookie invalid')
  const cookie = normalizeCookie(rawCookie)
  const { bdstoken, uk } = await fetchBdstoken(cookie)
  const next: BaiduPanAuth = { cookie, bdstoken, uk, savedAt: Date.now() }
  await setAuth(next)
  log.info('[百度网盘] 登录成功')
  return next
}

/** 从 WebView 的 Cookie 罐里读 Cookie 并登录 */
export const loginWithCookieManager = async (): Promise<BaiduPanAuth> => {
  const cookies = await CookieManager.get('https://pan.baidu.com', true)
  const list = Object.keys(cookies).map((key) => `${key}=${cookies[key].value}`)
  const bduss = cookies.BDUSS?.value
  if (!bduss) throw new BaiduPanAuthError(-1, 'no BDUSS cookie')
  return loginWithCookie(list.join('; '))
}

/** 校验当前凭证是否还有效（首次用到时调用一次即可） */
export const verifyBaiduPanAuth = async (): Promise<boolean> => {
  const current = auth ?? (await loadBaiduPanAuth())
  if (!current) return false
  try {
    const { bdstoken } = await fetchBdstoken(current.cookie)
    if (bdstoken !== current.bdstoken) {
      await setAuth({ ...current, bdstoken, savedAt: Date.now() })
    }
    return true
  } catch {
    await setAuth(null)
    return false
  }
}
