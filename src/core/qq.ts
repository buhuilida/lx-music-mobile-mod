import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import accountActions from '@/store/account/action'
import txUser, { clearTxCache, getLoginUserInfo, getUinFromCookie, hasTxSession } from '@/utils/musicSdk/tx/user'
import { clearQimeiCache } from '@/utils/musicSdk/tx/qimei'
import { toNewMusicInfo } from '@/utils'

/**
 * QQ 音乐账号中心
 *
 * - 登录：内置官方网页登录后写入 Cookie（手机号接口已移除）
 * - 昵称 / 头像：优先用 GetLoginUserInfo 接口拉真实资料，
 *   拿不到才退化成「QQ音乐用户 + uin」，避免显示成「网易云用户」
 */

const getCookie = () => settingState.setting['platform.txCookie'] ?? ''

/** 只有拿到播放密钥才算登录（uin 可以由接口反查，不再是必要条件） */
export const isQQLoggedIn = () => hasTxSession(getCookie())

const toOnlineList = (list: unknown) => (Array.isArray(list) ? list : []).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)

/** 用 cookie 里的 uin 拼一个兜底昵称 */
const fallbackProfile = (cookie: string) => {
  const uin = getUinFromCookie(cookie)
  return {
    uid: uin,
    nickname: uin ? `QQ音乐用户 ${uin}` : 'QQ音乐用户',
    avatar: uin ? `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` : '',
  }
}

export const initQQ = async(force = false) => {
  const cookie = getCookie()
  if (!cookie || !hasTxSession(cookie)) {
    accountActions.resetTx()
    return ''
  }
  if (force) clearTxCache()
  accountActions.setTxAccount({ loading: true })
  try {
    const info = await getLoginUserInfo(cookie)
    if (info?.uin) {
      accountActions.setTxAccount({
        uid: info.uin,
        nickname: info.nickname || `QQ音乐用户 ${info.uin}`,
        avatar: info.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${info.uin}&s=640`,
        inited: true,
        loading: false,
      })
      return info.uin
    }
  } catch (err) {
    console.log('ACCOUNT tx_get_user_info_failed ' + (err instanceof Error ? err.message : String(err)))
  }
  // 接口拿不到就先用 Cookie 里的 uin 顶上，保证界面不会显示成「未登录」
  const fallback = fallbackProfile(cookie)
  accountActions.setTxAccount({ ...fallback, inited: true, loading: false })
  return fallback.uid
}

/** 直接写入 Cookie（从设置页粘贴 / 网页登录自动落库） */
export const loginQQWithCookie = async(cookie: string) => {
  const value = cookie.trim()
  if (!value) return Promise.reject(new Error('Cookie 为空'))
  if (!hasTxSession(value)) {
    return Promise.reject(new Error('Cookie 里没有 qm_keyst / qqmusic_key，请在登录成功后再点一次「已登录，检测」'))
  }
  updateSetting({ 'platform.txCookie': value })
  clearTxCache()
  accountActions.resetTx()
  return initQQ(true)
}

export const logoutQQ = async() => {
  updateSetting({ 'platform.txCookie': '' })
  clearTxCache()
  accountActions.resetTx()
  clearQimeiCache()
}

/**
 * 推荐类接口在未登录时也会返回通用推荐（实测 36 首），
 * 所以这里不再用 isQQLoggedIn() 硬拦 —— 拦掉只会让用户看到
 * 「请先登录」，而明明有内容可放。登录后自然变成个性化推荐。
 */
export const getQQDailyRecommend = async() => {
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

/** 推荐歌单（歌单广场精选，公开接口，未登录也能看） */
export const getQQRecommendPlaylists = async() => {
  return txUser.getRecommendPlaylists()
}

export const getQQFavAlbums = async() => {
  if (!isQQLoggedIn()) return Promise.reject(new Error('请先登录 QQ 音乐'))
  return txUser.getFavAlbums()
}

export const getQQPlaylistSongs = async(tid: string | number, dirid = 0) => {
  return toOnlineList(await txUser.getPlaylistSongs(tid, dirid))
}

export const getQQAlbumSongs = async(albumMid: string) => {
  return toOnlineList(await txUser.getAlbumSongs(albumMid))
}

export const getQQRadarSongs = async() => {
  return toOnlineList(await txUser.getRadarSongs())
}

export const getQQGuessSongs = async() => {
  return toOnlineList(await txUser.getGuessYouLike())
}

export const getQQNewSongs = async() => {
  return toOnlineList(await txUser.getNewSongs())
}

export const getQQHomeRecommend = async() => {
  return toOnlineList(await txUser.getHomeRecommend())
}
