import settingState from '@/store/setting/state'
import neteaseState from '@/store/netease/state'
import txUser, { getUinFromCookie, hasTxSession } from '@/utils/musicSdk/tx/user'
import kgUser, { hasKgSession } from '@/utils/musicSdk/kg/user'
import wyUser from '@/utils/musicSdk/wy/user'

/**
 * 三平台账号状态
 *
 * 之前「我的音乐」和「平台设置」各自用 `cookie.length > 0` 判断登录态：
 * Cookie 过期了仍显示已登录，反过来说「已保存 Cookie」又写成「已登录」，两边对不上。
 * 这里统一成一次真实校验：拿账号信息成功才算 ok，明确区分
 * 未登录 / 校验中 / 已登录 / 已失效。
 */

export type PlatformKey = 'wy' | 'tx' | 'kg'

export type AccountStatus =
  | 'off' // 没保存 Cookie
  | 'checking' // 正在校验
  | 'ok' // 校验通过
  | 'expired' // Cookie 已失效
  | 'error' // 网络等原因没校验成功

export interface AccountSnapshot {
  status: AccountStatus
  name: string
  avatar: string
  vipType?: number
}

const getCookie = (platform: PlatformKey): string => {
  if (platform == 'wy') return settingState.setting['platform.wyCookie'] ?? ''
  if (platform == 'tx') return settingState.setting['platform.txCookie'] ?? ''
  return settingState.setting['platform.kgCookie'] ?? ''
}

/**
 * QQ 网页登录拿不到昵称（官方头部接口要 sig，未做）。
 * 与 Walnut 一致：昵称用「QQ音乐用户 <uin>」，头像用 QQ 头像接口兜底。
 */
export const getQQDisplayFromCookie = (cookie: string) => {
  const uin = getUinFromCookie(cookie)
  return uin
    ? { name: `QQ音乐用户 ${uin}`, avatar: `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` }
    : { name: '', avatar: '' }
}

/** 只判断本地有没有存 Cookie，不发请求 */
export const isSaved = (platform: PlatformKey): boolean => {
  const cookie = getCookie(platform)
  if (!cookie) return false
  if (platform == 'tx') return hasTxSession(cookie)
  if (platform == 'kg') return hasKgSession(cookie)
  return cookie.includes('MUSIC_U=')
}

/** 本地缓存的账号信息（不保证 Cookie 还有效） */
export const getCachedAccount = (platform: PlatformKey): AccountSnapshot => {
  if (platform == 'wy') {
    return {
      status: isSaved('wy') ? 'ok' : 'off',
      name: neteaseState.profile.nickname ?? '',
      avatar: neteaseState.profile.avatarUrl ?? '',
      vipType: neteaseState.profile.vipType,
    }
  }
  return { status: isSaved(platform) ? 'ok' : 'off', name: '', avatar: '' }
}

/**
 * 真实校验一次 Cookie 是否还有效
 * @param platform 平台
 * @param cookie 指定 Cookie（登录后立刻校验时用）
 */
export const verifyAccount = async(platform: PlatformKey, cookie = getCookie(platform)): Promise<AccountSnapshot> => {
  if (!cookie) return { status: 'off', name: '', avatar: '' }
  try {
    if (platform == 'wy') {
      const uid = await wyUser.getUid(cookie) as string
      if (!uid) return { status: 'expired', name: '', avatar: '' }
      const profile = await wyUser.getProfile(uid) as { nickname?: string, avatarUrl?: string, vipType?: number }
      return {
        status: 'ok',
        name: profile?.nickname ?? '',
        avatar: profile?.avatarUrl ?? '',
        vipType: profile?.vipType,
      }
    }
    if (platform == 'tx') {
      // 拉一次「我创建的歌单」：能返回就说明 uin + musickey 仍然有效
      const list = await txUser.getCreatedPlaylists(undefined, cookie) as unknown[]
      if (!Array.isArray(list)) return { status: 'expired', name: '', avatar: '' }
      return { status: 'ok', ...getQQDisplayFromCookie(cookie) }
    }
    // 酷狗没登录时 getDeviceInfo 也能拿到设备号，这里先卡一道 Cookie 校验
    if (!hasKgSession(cookie)) return { status: 'expired', name: '', avatar: '' }
    const list = await kgUser.getMyPlaylists() as unknown[]
    if (!Array.isArray(list)) return { status: 'expired', name: '', avatar: '' }
    return { status: 'ok', name: '', avatar: '' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '')
    // 只有明确的「没登录 / 凭证无效」才算失效，网络错误不能误判
    if (/80030|登录|login|未设置|Cookie|userid|token/i.test(msg)) {
      return { status: 'expired', name: '', avatar: '' }
    }
    return { status: 'error', name: '', avatar: '' }
  }
}
