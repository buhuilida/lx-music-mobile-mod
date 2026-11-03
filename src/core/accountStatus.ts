import settingState from '@/store/setting/state'
import neteaseState from '@/store/netease/state'
import { getLoginUserInfo, getUinFromCookie, hasTxSession } from '@/utils/musicSdk/tx/user'
import kgUser, { hasKgSession } from '@/utils/musicSdk/kg/user'
import wyUser from '@/utils/musicSdk/wy/user'

/**
 * 四平台账号状态
 *
 * 统一成一次真实校验：拿账号信息成功才算 ok，明确区分
 * 未登录 / 校验中 / 已登录 / 已失效。
 *
 * 1.22.5 修正：
 * - QQ 之前用「我创建的歌单」当校验，但该接口传假 uin 也返回 code 0 + 空数组，
 *   等于永远校验通过；改成 GetLoginUserInfo，未登录直接返回 1000。
 * - 昵称兜底不再写死「网易云用户」，按平台给。
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

/** 平台名，用于文案兜底 */
export const PLATFORM_NAME: Record<PlatformKey, string> = {
  wy: '网易云音乐',
  tx: 'QQ 音乐',
  kg: '酷狗音乐',
}

const getCookie = (platform: PlatformKey): string => {
  if (platform == 'wy') return settingState.setting['platform.wyCookie'] ?? ''
  if (platform == 'tx') return settingState.setting['platform.txCookie'] ?? ''
  if (platform == 'kg') return settingState.setting['platform.kgCookie'] ?? ''
  return ''
}

/**
 * QQ 网页登录拿不到昵称时的兜底。
 * 优先用 GetLoginUserInfo 拉真实资料，失败才用 uin 拼。
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

/** 把接口报错归类成「失效」还是「网络错误」 */
const isAuthError = (msg: string) => /1000|80000|80030|80050|104403|登录已失效|未登录|请先登录|login|Cookie|userid|token/i.test(msg)

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
      // GetLoginUserInfo 是唯一能确认「authst 真的有效」的接口：
      // 未登录固定返回 1000，不会像歌单接口那样假 uin 也回 code 0。
      const info = await getLoginUserInfo(cookie)
      if (!info) return { status: 'expired', name: '', avatar: '' }
      const uin = info.uin || getUinFromCookie(cookie)
      return {
        status: 'ok',
        name: info.nickname || (uin ? `QQ音乐用户 ${uin}` : 'QQ音乐用户'),
        avatar: info.avatar || (uin ? `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` : ''),
        vipType: info.vipType,
      }
    }
    // 酷狗没登录时 getDeviceInfo 也能拿到设备号，这里先卡一道 Cookie 校验
    if (!hasKgSession(cookie)) return { status: 'expired', name: '', avatar: '' }
    const list = await kgUser.getMyPlaylists() as unknown[]
    if (!Array.isArray(list)) return { status: 'expired', name: '', avatar: '' }
    return { status: 'ok', name: '', avatar: '' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '')
    // 只有明确的「没登录 / 凭证无效」才算失效，网络错误不能误判
    if (isAuthError(msg)) return { status: 'expired', name: '', avatar: '' }
    return { status: 'error', name: '', avatar: '' }
  }
}
