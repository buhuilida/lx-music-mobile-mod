import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import accountActions from '@/store/account/action'
import kgUser, { getDeviceInfo, hasKgSession } from '@/utils/musicSdk/kg/user'
import { toNewMusicInfo } from '@/utils'

/**
 * 酷狗音乐账号中心（1.22.0）
 *
 * 每日推荐是免登录接口（实测可用），歌单相关需要 Cookie。
 * 酷狗的手机号验证码登录是 AES + RSA 双重加密 + 风控头，
 * 没有真机条件验证，这里不做，改为 Cookie 登录。
 */

const getCookie = () => settingState.setting['platform.kgCookie'] ?? ''

export const isKgLoggedIn = () => hasKgSession(getCookie())

const toOnlineList = (list: unknown) => (Array.isArray(list) ? list : []).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)

export const initKg = async(force = false) => {
  const cookie = getCookie()
  if (!cookie) {
    accountActions.resetKg()
    return ''
  }
  const dev = await getDeviceInfo(force)
  accountActions.setKgAccount({ uid: dev.userid, inited: true })
  return dev.userid
}

export const loginKgWithCookie = async(cookie: string) => {
  const value = cookie.trim()
  if (!value) return Promise.reject(new Error('Cookie 为空'))
  if (!hasKgSession(value)) return Promise.reject(new Error('Cookie 里缺少 userid 或 token，请重新复制'))
  updateSetting({ 'platform.kgCookie': value })
  accountActions.resetKg()
  return initKg(true)
}

export const logoutKg = async() => {
  updateSetting({ 'platform.kgCookie': '' })
  accountActions.resetKg()
}

/** 每日推荐（免登录） */
export const getKgDailyRecommend = async() => {
  return toOnlineList(await kgUser.getDailyRecommend())
}

export const getKgMyPlaylists = async() => {
  if (!isKgLoggedIn()) return Promise.reject(new Error('请先登录酷狗音乐'))
  return kgUser.getMyPlaylists()
}

export const getKgLikedSongs = async() => {
  if (!isKgLoggedIn()) return Promise.reject(new Error('请先登录酷狗音乐'))
  return toOnlineList(await kgUser.getLikedSongs())
}

export const getKgPlaylistSongs = async(listid: string | number) => {
  return toOnlineList(await kgUser.getPlaylistSongs(listid))
}
