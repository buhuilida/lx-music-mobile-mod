import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import neteaseState from '@/store/netease/state'
import neteaseActions from '@/store/netease/action'
import type { WyArtist } from '@/store/netease/state'
import { clearWyUidCache } from '@/utils/data'
import { toNewMusicInfo } from '@/utils'
import wyUser from '@/utils/musicSdk/wy/user'
import wyDailyRec from '@/utils/musicSdk/wy/dailyRec'
import wyAlbum from '@/utils/musicSdk/wy/album'
import wyArtist from '@/utils/musicSdk/wy/artist'
import wyMusicDetail from '@/utils/musicSdk/wy/musicDetail'

/**
 * 网易云账号中心（1.20.0）
 *
 * 之前只有「粘贴 Cookie 打开歌单」，没有账号体系。这里把 Walnut 分支里
 * 每日推荐 / 关注歌手 / 云盘 / 我的歌单 这套能力接进来：
 * - 登录：二维码（手机网易云扫码）或直接粘贴 Cookie
 * - 数据：每日推荐、关注歌手、云盘、我创建和收藏的歌单、我喜欢的音乐
 * - 状态：昵称、头像、VIP 类型缓存到本地 store，页面共用
 */

const getCookie = () => settingState.setting['platform.wyCookie'] ?? ''

export const isNeteaseLoggedIn = () => Boolean(getCookie())

type WyRaw = Record<string, any>

const asRawList = (value: unknown): WyRaw[] => Array.isArray(value) ? (value as WyRaw[]) : []

const toOnlineList = (rawList: WyRaw[]): LX.Music.MusicInfoOnline[] => {
  return rawList.map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)
}

/**
 * 初始化账号信息（应用启动 / 登录后调用）
 */
export const initNetease = async(force = false) => {
  const cookie = getCookie()
  if (!cookie) {
    neteaseActions.reset()
    return
  }
  if (neteaseState.inited && !force) return
  neteaseActions.setLoading(true)
  try {
    const uid = await wyUser.getUid(cookie)
    await wyUser.getProfile(uid)
    const [likedIds, followed] = await Promise.all([
      wyUser.getLikedSongList(uid, cookie).catch((): unknown[] => []),
      wyUser.getAllSublist(cookie).catch((): unknown[] => []),
    ])
    neteaseActions.setLikedIds((likedIds as unknown[]).map(id => String(id)))
    neteaseActions.setFollowedArtists(followed as WyArtist[])
    neteaseActions.setInited(true)
    return uid
  } catch (err) {
    console.log('netease init error', err)
    neteaseActions.setInited(false)
    throw err
  } finally {
    neteaseActions.setLoading(false)
  }
}

/** 保存 Cookie 并立即校验 */
export const loginWithCookie = async(cookie: string) => {
  const value = cookie.trim()
  if (!value) return Promise.reject(new Error('Cookie 为空'))
  updateSetting({ 'platform.wyCookie': value })
  neteaseActions.reset()
  return initNetease(true)
}

/** 二维码登录成功后写入 Cookie */
export const loginWithQrCookie = async(cookieParts: string[]) => {
  const cookie = cookieParts.filter(Boolean).join('; ')
  return loginWithCookie(cookie)
}

/** 发送手机验证码（1.21.0） */
export const sendWyPhoneCode = async(phone: string, countrycode = '86') => {
  return wyUser.sendPhoneCode(phone, countrycode)
}

/**
 * 手机号登录（1.21.0）：密码或短信验证码，成功后直接写入 Cookie
 */
export const loginNeteaseWithPhone = async(options: {
  phone: string
  countrycode?: string
  password?: string
  captcha?: string
}) => {
  const result = await wyUser.loginWithPhone(options) as { cookie?: string }
  const cookie = result?.cookie ?? ''
  if (!cookie) throw new Error('登录失败：未获取到登录凭据')
  return loginWithCookie(cookie)
}

export const logoutNetease = async() => {
  updateSetting({ 'platform.wyCookie': '' })
  neteaseActions.reset()
  await clearWyUidCache()
}

/** 每日推荐 */
export const getDailyRecommend = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const result = await wyDailyRec.getList(cookie) as { list?: unknown }
  return toOnlineList(asRawList(result.list))
}

/** 每日推荐里的推荐歌单 */
export const getRecommendPlaylists = async() => {
  const cookie = getCookie()
  if (!cookie) return []
  return wyDailyRec.getRecPlaylists(cookie)
}

/** 关注歌手 */
export const getFollowedArtists = async() => {
  const cookie = getCookie()
  if (!cookie) return []
  const list = asRawList(await wyUser.getAllSublist(cookie)) as unknown as WyArtist[]
  neteaseActions.setFollowedArtists(list)
  return list
}

/** 歌手热门歌曲 */
export const getArtistSongs = async(id: string | number, limit = 100) => {
  const result = await wyArtist.getSongs(id, 'hot', limit, 0) as { list?: unknown }
  return toOnlineList(asRawList(result.list))
}

/** 云盘歌曲 */
export const getCloudSongs = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const raw = asRawList(await wyUser.getCloudSongs(1000, 0, cookie))
  neteaseActions.setCloudCount(raw.length)
  if (!raw.length) return []

  // 云盘接口只给基础字段，能匹配到歌曲 ID 的走一次详情接口拿完整音质信息
  const ids = raw.map((item: any) => Number(item.songId)).filter((id: number) => id > 0)
  let detailMap = new Map<number, any>()
  if (ids.length) {
    try {
      // 接口一次最多 500 个 ID，分批请求
      for (let i = 0; i < ids.length; i += 500) {
        const result = await wyMusicDetail.getList(ids.slice(i, i + 500)) as { list?: unknown }
        asRawList(result.list).forEach((item) => { detailMap.set(Number(item.songmid), item) })
      }
    } catch (err) {
      console.log('cloud detail error', err)
    }
  }

  const list: LX.Music.MusicInfoOnline[] = []
  raw.forEach((item: any) => {
    const detail = detailMap.get(Number(item.songId))
    if (detail) {
      list.push(toNewMusicInfo(detail) as LX.Music.MusicInfoOnline)
      return
    }
    // 未匹配到曲库（自己上传的文件）：用云盘信息构造，音质按文件码率给 320k
    const simple = item.simpleSong ?? {}
    const id = item.songId > 0 ? item.songId : simple.id
    if (!id) return
    const types = [{ type: '320k', size: null }]
    list.push({
      id: `wy_${id}`,
      name: item.songName ?? simple.name ?? item.fileName,
      singer: item.artist ?? simple.ar?.map((ar: any) => ar.name).join('、') ?? '未知歌手',
      source: 'wy',
      interval: simple.dt ? `${Math.floor(simple.dt / 60000)}:${String(Math.floor((simple.dt % 60000) / 1000)).padStart(2, '0')}` : null,
      meta: {
        songId: id,
        albumName: item.album ?? simple.al?.name ?? '云盘',
        picUrl: simple.al?.picUrl ?? '',
        qualitys: types,
        _qualitys: { '320k': { size: null } },
      },
    } as unknown as LX.Music.MusicInfoOnline)
  })
  return list
}

/** 我的歌单（创建 + 收藏） */
export const getMyPlaylists = async() => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const uid = neteaseState.profile.uid || await wyUser.getUid(cookie)
  return wyUser.getUserPlaylists(uid, cookie)
}

/** 我喜欢的音乐 */
export const getLikedSongs = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const ids: string[] = neteaseState.likedIds.length
    ? neteaseState.likedIds
    : ((await wyUser.getLikedSongList(neteaseState.profile.uid || await wyUser.getUid(cookie), cookie)) as unknown as string[])
  if (!ids.length) return []
  const result = await wyMusicDetail.getList(ids.map(id => Number(id))) as { list?: unknown }
  return toOnlineList(asRawList(result.list))
}

export const isLikedSong = (songId: string) => {
  return neteaseState.likedIds.includes(songId)
}

/** 红心 / 取消红心 */
export const toggleLikeSong = async(songId: string, like: boolean) => {
  await wyUser.likeSong(songId, like)
  const set = new Set(neteaseState.likedIds)
  if (like) set.add(songId)
  else set.delete(songId)
  neteaseActions.setLikedIds([...set])
}

/** 我收藏的歌单（1.21.0） */
export const getSubscribedPlaylists = async() => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const list = await wyUser.getUserPlaylists(neteaseState.profile.uid || await wyUser.getUid(cookie), cookie) as WyRaw[]
  return asRawList(list).filter(item => item.subscribed)
}

/** 我收藏的专辑（1.21.0） */
export const getSubAlbums = async() => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const list = await wyUser.getSubAlbumList(100, 0, cookie) as unknown
  return asRawList(list)
}

/** 新碟上架（1.21.0） */
export const getNewAlbums = async(limit = 30, offset = 0) => {
  const list = await wyAlbum.getNewAlbums(limit, offset) as unknown
  return asRawList(list)
}

/** 专辑歌曲（收藏专辑 / 新碟点击进入） */
export const getAlbumSongs = async(albumId: string | number) => {
  const result = await wyAlbum.getAlbum(albumId) as { list?: unknown }
  return toOnlineList(asRawList(result.list))
}

/**
 * 心动模式（1.21.0）：基于当前歌曲生成一串相似推荐
 * Walnut 分支里就是这个接口，playlistId 传 0 也能出结果
 */
export const getHeartbeatSongs = async(songId: string | number, playlistId: string | number = 0) => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const result = await wyDailyRec.getHeartbeatModeList(cookie, playlistId, songId) as { list?: unknown }
  return toOnlineList(asRawList(result.list))
}
