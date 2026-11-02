import { httpFetch } from '../../request'
import { getQQDevice, getQQQimei } from './qimei'
import settingState from '@/store/setting/state'

/**
 * QQ 音乐账号能力（1.22.0）
 *
 * 从 Walnut 版 APK（v26.09.28）的 Hermes 字节码还原：
 * - 所有接口统一走 `https://u.y.qq.com/cgi-bin/musicu.fcg`，
 *   参数为 `{ comm, req_0: { module, method, param } }`，以 GET data= 传入
 * - 登录不再自建接口：手机号 / 扫码分支已删除，统一用内置官方网页登录
 */

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PAGE_SIZE = 100

const getCookie = () => settingState.setting['platform.txCookie'] ?? ''

/** 从 Cookie 里取 uin（QQ 号），兼容 o0123456789 与纯数字两种写法 */
export const getUinFromCookie = (cookie = getCookie()) => {
  const match = cookie.match(/(?:^|;\s*)(?:uin|qqmusic_uin|wxuin)=([^;]+)/)
  if (!match) return ''
  return match[1].trim().replace(/^o/, '')
}

/** 判断 Cookie 里是否有可用的登录态 */
export const hasTxSession = (cookie = getCookie()) => {
  if (!cookie) return false
  if (!/(?:^|;\s*)(?:uin|qqmusic_uin|wxuin)=/.test(cookie)) return false
  return /(?:^|;\s*)(?:qqmusic_key|qm_keyst|p_skey|skey)=/.test(cookie)
}

/** 从 Cookie 里取播放密钥（musickey），comm.authst 用 */
const getKeyFromCookie = (cookie = getCookie()) => {
  const match = cookie.match(/(?:^|;\s*)(?:qqmusic_key|qm_keyst)=([^;]+)/)
  return match ? match[1].trim() : ''
}

/**
 * 组装请求公共参数 comm
 *
 * 对齐 APK 里的 `buildQQComm`：除版本号外还带设备信息与 QIMEI，
 * 风控接口（发验证码 / 登录）会看这些字段判断环境是否可信。
 * QIMEI 取不到时用内置默认值，不阻塞请求。
 */
const buildComm = async(extra = {}, cookie = getCookie()) => {
  const device = getQQDevice()
  const qimei = await getQQQimei().catch(() => ({ q16: '', q36: '' }))
  return {
    ct: 11,
    cv: 14090008,
    v: 14090008,
    chid: '10003505',
    qq: getUinFromCookie(cookie) || null,
    authst: getKeyFromCookie(cookie) || null,
    tmeAppID: 'qqmusic',
    QIMEI: qimei.q16,
    QIMEI36: qimei.q36,
    OpenUDID: device.openUdid,
    OpenUDID2: device.openUdid,
    udid: device.openUdid,
    aid: device.androidId,
    os_ver: device.release,
    phonetype: device.model,
    devicelevel: String(device.sdk),
    newdevicelevel: String(device.sdk),
    rom: device.fingerprint,
    ...extra,
  }
}

/**
 * 统一请求
 * @param {string} module 模块名，如 music.musicasset.PlaylistBaseRead
 * @param {string} method 方法名
 * @param {object} param 参数
 * @param {object} comm 业务参数（tmeLoginMethod 等），会覆盖到 comm 上
 * @param {string} cookie 指定 Cookie，默认取设置里的
 */
const send = async(module, method, param, comm = {}, cookie = getCookie()) => {
  const data = {
    comm: await buildComm(comm, cookie),
    req_0: { module, method, param },
  }
  // 对齐 Walnut APK 与 LX 自带 tx 模块的做法：GET + data= 查询串，
  // 不带 sign。之前用 POST body + sign 时部分接口会直接返回错误码，
  // 表现就是「点了功能按钮什么都没发生」。
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json' +
    '&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0' +
    `&data=${encodeURIComponent(JSON.stringify(data))}`
  const requestObj = httpFetch(url, {
    method: 'get',
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://y.qq.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })
  const res = await requestObj.promise
  if (res.statusCode !== 200) throw new Error(`QQ 音乐请求失败（${res.statusCode}）`)
  const payload = res.body
  if (!payload || typeof payload !== 'object') throw new Error('QQ 音乐返回异常')
  const req = payload.req_0 ?? {}
  // 外层 code 非 0 时把服务端提示抛出去，方便错误日志定位
  if (payload.code !== 0 && payload.code !== undefined) {
    throw new Error(payload.msg || `QQ 音乐接口错误（${payload.code}）`)
  }
  return req
}

/**
 * 用 songid 批量换歌曲详情。
 * 推荐流里给的是 `{type: 200, id: <songid>}` 这种卡片，
 * 必须再调 CgiGetTrackInfo 才能拿到 mid / 歌手 / 专辑。
 */
const getTracksByIds = async(ids, cookie = getCookie()) => {
  const result = []
  let lastError = ''
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const part = ids.slice(i, i + PAGE_SIZE)
    const req = await send('music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo', {
      ctx: 0,
      client: 1,
      types: part.map(() => 0),
      modify_stamp: part.map(() => 0),
      ids: part,
    }, {}, cookie)
    if (req.code !== 0) {
      // 10006 是请求过频，把原因带出去，让页面能提示「稍后重试」
      lastError = req.code === 10006 ? 'QQ 音乐接口繁忙，请稍后重试' : `获取歌曲详情失败（${req.code}）`
      continue
    }
    result.push(...(req.data?.tracks ?? []))
  }
  if (!result.length && lastError) throw new Error(lastError)
  return toMusicList(result)
}

/**
 * 取推荐流歌曲
 *
 * 实测（未登录也返回数据）：direction 才是「换一批内容」的开关，
 * page 传 2 及以上恒为空数组 —— 之前按 page 递增取每日/猜你喜欢，
 * 结果除主页外全是空，页面看起来就像「点了没反应」。
 * @param {number} direction 0 主页 / 1 每日 / 2 猜你喜欢 / 3 新歌
 */
const getFeedSongs = async(direction, cookie = getCookie()) => {
  const req = await send('music.recommend.RecommendFeed', 'get_recommend_feed', {
    direction,
    page: 1,
    s_num: 0,
    v_cache: [],
  }, {}, cookie)
  if (req.code !== 0) throw new Error(`获取推荐失败（${req.code}）`)

  const ids = []
  for (const block of (req.data?.v_shelf ?? [])) {
    for (const niche of (block?.v_niche ?? [])) {
      for (const card of (niche?.v_card ?? [])) {
        // type 200 才是歌曲卡，其它是歌单 / 电台 / 榜单
        if (card?.type === 200 && card.id) ids.push(card.id)
      }
    }
  }
  if (!ids.length) return []
  return getTracksByIds(ids, cookie)
}

const pickList = (data, keys) => {
  if (!data) return []
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value) && value.length) return value
  }
  return []
}

/** 把 QQ 的歌曲对象统一成应用内的结构 */
const toMusicInfo = (track) => {
  if (!track) return null
  const info = track.track_info ?? track.trackInfo ?? track.songinfo ?? track
  const mid = info.mid ?? info.songmid ?? info.songMid
  if (!mid) return null
  const singers = Array.isArray(info.singer)
    ? info.singer.map(item => item?.name ?? item?.title ?? '').filter(Boolean).join('、')
    : (info.singername ?? info.singerName ?? '')
  const album = info.album ?? {}
  const albumMid = album.mid ?? album.pmid ?? info.albummid ?? info.albumMid ?? ''
  const interval = Number(info.interval ?? info.duration ?? 0)
  const types = [
    { type: '128k', size: 'unknown' },
    { type: '320k', size: 'unknown' },
    { type: 'flac', size: 'unknown' },
  ]
  return {
    source: 'tx',
    songmid: mid,
    name: info.name ?? info.title ?? info.songname ?? '',
    singer: singers,
    interval,
    albumId: albumMid,
    albumName: album.name ?? album.title ?? info.albumname ?? info.albumName ?? '',
    img: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
    types,
    _types: {
      '128k': { size: 'unknown' },
      '320k': { size: 'unknown' },
      flac: { size: 'unknown' },
    },
  }
}

const toMusicList = (list) => list.map(toMusicInfo).filter(Boolean)


export default {
  // ---------------------------------------------------------------- 账号数据

  /** 我创建的歌单 */
  async getCreatedPlaylists(uin = getUinFromCookie(), cookie = getCookie()) {
    if (!uin) throw new Error('Cookie 里没有找到 QQ 号')
    const req = await send('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin: String(uin) }, {}, cookie)
    if (req.code !== 0) throw new Error(`获取歌单失败（${req.code}）`)
    const list = req.data?.v_playlist ?? []
    // dirId 202/205/206 是系统歌单（我喜欢、本地、最近播放），单独处理
    return list.map(item => ({
      id: String(item.tid),
      tid: item.tid,
      dirid: item.dirId,
      name: item.dirName,
      cover: item.picUrl || item.bigpicUrl || '',
      songCount: item.songNum ?? 0,
      desc: item.desc ?? '',
      isFavorites: item.dirId == 201,
    }))
  },

  /** 收藏的歌单 */
  async getFavPlaylists(begin = 0, num = PAGE_SIZE, uin = getUinFromCookie(), cookie = getCookie()) {
    const req = await send('music.musicasset.PlaylistFavRead', 'CgiGetPlaylistFavInfo', {
      offset: begin,
      size: num,
      uin: String(uin),
    }, {}, cookie)
    if (req.code !== 0) throw new Error(`获取收藏歌单失败（${req.code}）`)
    const list = req.data?.v_list ?? req.data?.list ?? []
    return list.map(item => ({
      id: String(item.tid ?? item.dissid),
      tid: item.tid ?? item.dissid,
      dirid: item.dirId ?? 0,
      name: item.title ?? item.dirName ?? item.name,
      cover: item.picurl ?? item.picUrl ?? item.cover ?? '',
      songCount: item.songnum ?? item.songNum ?? 0,
      desc: item.desc ?? '',
      creator: item.creator?.name ?? item.nick ?? '',
      isFavorites: false,
    }))
  },

  /** 收藏的专辑 */
  async getFavAlbums(begin = 0, num = PAGE_SIZE, uin = getUinFromCookie(), cookie = getCookie()) {
    const req = await send('music.musicasset.AlbumFavRead', 'CgiGetAlbumFavInfo', {
      offset: begin,
      size: num,
      euin: String(uin),
    }, {}, cookie)
    if (req.code !== 0) throw new Error(`获取收藏专辑失败（${req.code}）`)
    const list = req.data?.v_list ?? req.data?.list ?? []
    return list.map(item => ({
      id: String(item.albumMid ?? item.mid ?? item.albumID ?? ''),
      mid: item.albumMid ?? item.mid ?? '',
      name: item.albumName ?? item.name ?? '',
      cover: item.albumPic ?? item.pic ?? '',
      singer: (item.singerList ?? item.singer ?? []).map(s => s.name).filter(Boolean).join('、'),
      songCount: item.songNum ?? 0,
      time: item.pubTime ?? '',
    }))
  },

  /** 歌单 / 我喜欢 的歌曲列表 */
  async getPlaylistSongs(disstid, dirid = 0, cookie = getCookie()) {
    const req = await send('music.srfDissInfo.DissInfo', 'CgiGetDiss', {
      disstid: parseInt(disstid),
      dirid: Number(dirid) || 0,
      tag: true,
      song_begin: 0,
      song_num: 999999,
      userinfo: true,
      orderlist: true,
      onlysonglist: false,
    }, {}, cookie)
    if (req.code !== 0) throw new Error(`获取歌单歌曲失败（${req.code}）`)
    const data = req.data ?? {}
    const list = pickList(data, ['songlist', 'songList', 'v_shelf'])
    return toMusicList(list.map(item => (item.track_info ? item.track_info : item)))
  },

  /**
   * 专辑歌曲
   * musicu 的 music.musichallAlbum.AlbumSongList 在未授权上下文里恒返回 104403，
   * 改用 c.y.qq.com 的旧版 fcg 接口（免登录，实测可用）。
   */
  async getAlbumSongs(albumMid) {
    if (!albumMid) throw new Error('专辑 ID 为空')
    const requestObj = httpFetch(
      'https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg' +
      `?albummid=${encodeURIComponent(albumMid)}&g_tk=5381&format=json&inCharset=utf8` +
      '&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0',
      {
        method: 'get',
        headers: { 'User-Agent': DESKTOP_UA, Referer: 'https://y.qq.com/' },
      },
    )
    const { body } = await requestObj.promise
    if (!body || body.code !== 0) throw new Error(`获取专辑歌曲失败（${body?.code ?? '未知'}）`)
    return toMusicList(body.data?.list ?? [])
  },

  /** 我喜欢的音乐：先找到 dirId=201 的歌单，再拉歌 */
  async getLikedSongs(cookie = getCookie()) {
    const uin = getUinFromCookie(cookie)
    const playlists = await this.getCreatedPlaylists(uin, cookie)
    const liked = playlists.find(item => item.isFavorites) ?? playlists.find(item => item.dirid == 201)
    if (!liked) return []
    return this.getPlaylistSongs(liked.tid, 201, cookie)
  },

  /** 每日推荐 */
  async getDailyRecommend(cookie = getCookie()) {
    return getFeedSongs(1, cookie)
  },

  /** 猜你喜欢（推荐流第 2 页起） */
  async getGuessYouLike(cookie = getCookie()) {
    return getFeedSongs(2, cookie)
  },

  /** 推荐新歌（新歌速递） */
  async getNewSongs(cookie = getCookie()) {
    return getFeedSongs(3, cookie)
  },

  /** 雷达推荐（根据口味推荐） */
  async getRadarSongs(page = 0, cookie = getCookie()) {
    const req = await send('music.recommend.TrackRelationServer', 'GetRadarSong', {
      Page: page,
      ReqType: 0,
      FavSongs: [],
      EntranceSongs: [],
    }, {}, cookie)
    if (req.code !== 0) throw new Error(`获取雷达推荐失败（${req.code}）`)
    const data = req.data ?? {}
    // 实际返回是 data.VecSongs[].Track（首字母大写，与 musicu 其它模块一致）
    const list = pickList(data, ['VecSongs', 'vec_songs', 'songlist', 'v_shelf'])
    if (!list.length) return []
    const tracks = list.map(item => item.Track ?? item.track ?? item.track_info ?? item)
    // 精简对象只有 id 时再补一次详情
    const ids = tracks.filter(item => !item.mid).map(item => item.id ?? item.songid).filter(Boolean)
    if (ids.length) return getTracksByIds(ids, cookie)
    return toMusicList(tracks)
  },

  /** 主页推荐（精选推荐） */
  async getHomeRecommend(cookie = getCookie()) {
    return getFeedSongs(0, cookie)
  },
}
