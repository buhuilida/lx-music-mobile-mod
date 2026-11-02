import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import accountActions from '@/store/account/action'
import txUser, { getUinFromCookie, hasTxSession } from '@/utils/musicSdk/tx/user'
import { clearQimeiCache } from '@/utils/musicSdk/tx/qimei'
import { toNewMusicInfo } from '@/utils'

/**
 * QQ 音乐账号中心（1.22.0）
 *
 * 能力全部来自 `utils/musicSdk/tx/user.js`，接口与签名从 Walnut 版 APK 还原：
 * - 手机号验证码登录（无需网页 / 无需滑块）
 * - 每日推荐、我喜欢、我的歌单、收藏歌单、收藏专辑、雷达推荐、猜你喜欢、推荐新歌
 */

const getCookie = () => settingState.setting['platform.txCookie'] ?? ''

export const isQQLoggedIn = () => hasTxSession(getCookie())

const toOnlineList = (list: unknown) => (Array.isArray(list) ? list : []).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)

export const initQQ = async(force = false) => {
  const cookie = getCookie()
  if (!cookie) {
    accountActions.resetTx()
    return ''
  }
  const uin = getUinFromCookie(cookie)
  accountActions.setTxAccount({ uid: uin, inited: true })
  return uin
}

/** 直接写入 Cookie（从设置页粘贴） */
export const loginQQWithCookie = async(cookie: string) => {
  const value = cookie.trim()
  if (!value) return Promise.reject(new Error('Cookie 为空'))
  if (!hasTxSession(value)) return Promise.reject(new Error('Cookie 里缺少 uin 或 qqmusic_key，请重新复制'))
  updateSetting({ 'platform.txCookie': value })
  accountActions.resetTx()
  return initQQ(true)
}

export const logoutQQ = async() => {
  updateSetting({ 'platform.txCookie': '' })
  accountActions.resetTx()
  clearQimeiCache()
}

export interface QQSendCodeResult {
  event: 'send' | 'captcha' | 'frequency'
  securityUrl: string
}

/** 发送验证码：返回 event 区分「已发送 / 需要安全验证 / 发送过频」 */
export const sendQQPhoneCode = async(phone: string): Promise<QQSendCodeResult> => {
  return txUser.sendPhoneCode(phone) as Promise<QQSendCodeResult>
}

/**
 * 手机号验证码登录：成功后把 Cookie 写进设置
 */
export const loginQQWithPhone = async(phone: string, code: string) => {
  const result = await txUser.loginByPhone(phone, code)
  updateSetting({ 'platform.txCookie': result.cookie })
  accountActions.resetTx()
  accountActions.setTxAccount({
    uid: result.uin,
    nickname: result.nickname,
    avatar: result.avatar,
    inited: true,
  })
  return result
}

export const getQQDailyRecommend = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getDailyRecommend())
}

export const getQQLikedSongs = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getLikedSongs())
}

export const getQQMyPlaylists = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  const list = await txUser.getCreatedPlaylists()
  return list.filter((item: { isFavorites: boolean }) => !item.isFavorites)
}

export const getQQFavPlaylists = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return txUser.getFavPlaylists()
}

export const getQQFavAlbums = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return txUser.getFavAlbums()
}

export const getQQPlaylistSongs = async(tid: string | number, dirid = 0) => {
  return toOnlineList(await txUser.getPlaylistSongs(tid, dirid))
}

export const getQQRadarSongs = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getRadarSongs())
}

export const getQQGuessSongs = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getGuessYouLike())
}

export const getQQNewSongs = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getNewSongs())
}

export const getQQHomeRecommend = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return toOnlineList(await txUser.getHomeRecommend())
}
