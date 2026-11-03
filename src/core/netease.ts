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
  // 一次请求塞几千个 id 会被服务端截断（返回空 songs），必须分批取
  const list: WyRaw[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500).map(id => Number(id))
    const result = await wyMusicDetail.getList(part) as { list?: unknown }
    list.push(...asRawList(result.list))
  }
  return toOnlineList(list)
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
 * 心动模式
 *
 * 服务端要求两个参数同时成立，缺一个就返回非 200（页面只看到「获取心动模式列表失败」）：
 * - `playlistId`：在哪个歌单范围内做相似漫游，不能是 0；
 * - `songId`：种子歌曲，必须真实存在。
 *
 * 之前入口处两样都可能传 0，所以恒失败。这里主动补齐，做法对齐 lxx：
 * - playlistId 缺省 → 「我喜欢的音乐」歌单 id
 * - songId 缺省 → 从「我喜欢的音乐」里随机取一首
 * 返回列表把种子歌放第一位，播放队列从用户熟悉的那首开始。
 */
export const getHeartbeatSongs = async(songId?: string | number, playlistId?: string | number) => {
  const cookie = getCookie()
  if (!cookie) return Promise.reject(new Error('请先登录网易云账号'))
  const uid = await wyUser.getUid(cookie)
  if (!uid) return Promise.reject(new Error('网易云登录状态已失效，请重新登录'))

  let pid = playlistId
  if (!pid) {
    const lists = asRawList(await wyUser.getUserPlaylists(uid, cookie))
    const liked = lists.find(item => Number(item.specialType ?? item.special_type) === 5)
    // 「我喜欢的音乐」的 id 一般就等于 uid，接口没给时用它兜底
    pid = liked?.id ?? uid
  }

  let sid = songId
  if (!sid) {
    let ids = (neteaseState.likedIds ?? []).map(String)
    if (!ids.length) ids = ((await wyUser.getLikedSongList(uid, cookie)) as unknown[]).map(String)
    if (!ids.length) throw new Error('需要先在网易云收藏几首歌，心动模式才有种子')
    sid = ids[Math.floor(Math.random() * ids.length)]
  }

  let result: { list?: unknown }
  try {
    result = await wyDailyRec.getHeartbeatModeList(cookie, pid, sid) as { list?: unknown }
  } catch (err) {
    // 歌单 id 可能因账号类型不同对不上，退回「我喜欢的音乐」（id 恒等于 uid）再试一次
    if (String(pid) === String(uid)) throw err
    result = await wyDailyRec.getHeartbeatModeList(cookie, uid, sid) as { list?: unknown }
  }
  const list = toOnlineList(asRawList(result.list))

  const seedId = String(sid)
  const hasSeed = list.some(item => String(item.meta?.songId ?? item.id).replace(/^wy_/, '') === seedId)
  if (!hasSeed) {
    // 种子歌详情拿不到不影响主流程，静默跳过
    try {
      const seed = await wyMusicDetail.getList([seedId]) as { list?: unknown }
      const seedList = toOnlineList(asRawList(seed.list))
      if (seedList.length) list.unshift(seedList[0])
    } catch {}
  }
  return list
}

/**
 * 私人FM
 *
 * 未登录时服务端只给 1 条通用推荐，登录后才是完整队列；
 * 所以这里累积请求几轮去重，避免未登录用户体验成「只有一首歌」。
 */
export const getPersonalFmSongs = async(limit = 30): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = getCookie()
  const result: LX.Music.MusicInfoOnline[] = []
  const seen = new Set<string>()
  for (let round = 0; round < 6; round++) {
    const res = await wyDailyRec.getPersonalFm(cookie, limit) as { list?: unknown }
    const list = toOnlineList(asRawList(res.list))
    for (const item of list) {
      const id = String(item.meta?.songId ?? item.id)
      if (seen.has(id)) continue
      seen.add(id)
      result.push(item)
    }
    if (result.length >= 10) break
  }
  return result
}
