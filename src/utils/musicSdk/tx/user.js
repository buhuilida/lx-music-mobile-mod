import { httpFetch } from '../../request'
import { zzcSign } from './sign'
import settingState from '@/store/setting/state'

/**
 * QQ 音乐账号能力（1.22.0）
 *
 * 从 Walnut 版 APK（v26.09.28）的 Hermes 字节码还原：
 * - 所有接口统一走 `https://u.y.qq.com/cgi-bin/musicu.fcg`，
 *   body 为 `{ comm, req_0: { module, method, param } }`，`sign` 由 zzcSign 计算
 * - 登录走后端 `music.login.LoginServer`（SendPhoneAuthCode / Login），
 *   不需要走 ptlogin2 网页流程，也没有滑块
 *
 * 说明：musicu.fcg 对 sign 的校验很松（错误 sign 也能拿到数据），
 * 但部分写接口（收藏、建歌单）会校验，所以这里一律正常签名。
 */

const UA = 'QQMusic 14090508(android 12)'
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

/**
 * 统一请求
 * @param {string} module 模块名，如 music.login.LoginServer
 * @param {string} method 方法名
 * @param {object} param 参数
 * @param {object} comm 业务参数（ct/cv/tmeLoginMethod 等）
 * @param {string} cookie 指定 Cookie，默认取设置里的
 * @param {boolean} raw 是否返回原始响应（登录需要响应头里的 Set-Cookie）
 */
const send = async(module, method, param, comm = {}, cookie = getCookie(), raw = false) => {
  const data = {
    comm: { ct: 24, cv: 1800, ...comm },
    req_0: { module, method, param },
  }
  // 注意：这里传对象而不是字符串。request 层会在 Content-Type 为 application/json 时
  // 统一 JSON.stringify 一次，传字符串会被二次转义，签名也会对不上。
  const bodyText = JSON.stringify(data)
  const sign = zzcSign(bodyText)
  const requestObj = httpFetch(`https://u.y.qq.com/cgi-bin/musicu.fcg?sign=${sign}&_=${Date.now()}`, {
    method: 'post',
    headers: {
      'User-Agent': UA,
      Referer: 'https://y.qq.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data,
  })
  const res = await requestObj.promise
  if (raw) return res
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
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const part = ids.slice(i, i + PAGE_SIZE)
    const req = await send('music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo', {
      ctx: 0,
      client: 1,
      types: part.map(() => 0),
      modify_stamp: part.map(() => 0),
      ids: part,
    }, {}, cookie)
    if (req.code !== 0) continue
    result.push(...(req.data?.tracks ?? []))
  }
  return toMusicList(result)
}

/**
 * 取推荐流某一页的歌曲
 * @param {number} page 0 主页 / 1 每日 / 2 猜你喜欢 / 3 新歌
 */
const getFeedSongs = async(page, cookie = getCookie()) => {
  const req = await send('music.recommend.RecommendFeed', 'get_recommend_feed', {
    direction: 0,
    page: page + 1,
    s_num: 0,
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
  if (!ids.length) throw new Error('推荐流里没有歌曲，请先登录 QQ 音乐账号')
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
  // ---------------------------------------------------------------- 登录

  /**
   * 发送手机验证码
   * module music.login.LoginServer / method SendPhoneAuthCode
   */
  async sendPhoneCode(phone, areaCode = '86') {
    const req = await send('music.login.LoginServer', 'SendPhoneAuthCode', {
      tmeAppid: 'qqmusic',
      areaCode: String(areaCode),
      phoneNo: String(phone),
    }, { tmeLoginMethod: 3 })
    if (req.code !== 0 && req.code !== undefined) {
      throw new Error(req.data?.errMsg || req.data?.msg || `验证码发送失败（${req.code}）`)
    }
    if (req.data?.securityURL) throw new Error('该号码需要安全验证，请改用 Cookie 登录')
    return true
  },

  /**
   * 验证码登录
   *
   * 一次请求就够：Login 返回 musicid + musickey，
   * Cookie 由这两个值本地拼出来（uin / qqmusic_uin / qm_keyst / qqmusic_key / login_type），
   * 不需要再走一次换 Cookie 的请求 —— 这一点与 APK 里的 qqCredentialToCookie 完全一致。
   */
  async loginByPhone(phone, code, areaCode = '86') {
    const req = await send('music.login.LoginServer', 'Login', {
      phoneNo: String(phone),
      code: String(code),
      loginMode: 1,
      areaCode: String(areaCode),
    }, { tmeLoginMethod: 3, tmeLoginType: 0 })
    if (req.code !== 0) {
      throw new Error(req.data?.errMsg || req.data?.msg || `登录失败（${req.code}）`)
    }
    const data = req.data ?? {}
    if (!data.musicid || !data.musickey) {
      throw new Error(data.errMsg || '登录失败：未拿到账号凭据')
    }

    const cookie = [
      `uin=${data.musicid}`,
      `qqmusic_uin=${data.musicid}`,
      `qm_keyst=${data.musickey}`,
      `qqmusic_key=${data.musickey}`,
      `login_type=${data.loginType ?? 0}`,
      ...(data.encryptUin ? [`euin=${data.encryptUin}`] : []),
      ...(data.refreshKey ? [`refresh_key=${data.refreshKey}`] : []),
    ].join('; ')

    return {
      cookie,
      uin: String(data.musicid),
      nickname: data.nick ?? data.nickname ?? '',
      avatar: data.logo ?? data.headurl ?? data.avatar ?? '',
    }
  },

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
    const list = pickList(data, ['vec_songs', 'songlist', 'v_shelf'])
    if (!list.length) return []
    // 雷达返回的可能是精简对象，也可能只有 id，统一再补一次详情
    const ids = list.map(item => item.id ?? item.songid).filter(Boolean)
    if (ids.length && !list[0].mid) return getTracksByIds(ids, cookie)
    return toMusicList(list.map(item => (item.track_info ? item.track_info : item)))
  },

  /** 主页推荐（精选推荐） */
  async getHomeRecommend(cookie = getCookie()) {
    return getFeedSongs(0, cookie)
  },
}
