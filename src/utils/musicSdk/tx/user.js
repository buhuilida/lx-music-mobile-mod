import { httpFetch } from '../../request'
import { sizeFormate } from '../../index'
import { getQQDevice, getQQQimei } from './qimei'
import settingState from '@/store/setting/state'

/**
 * QQ 音乐账号能力
 *
 * 所有接口统一走 `https://u.y.qq.com/cgi-bin/musicu.fcg`，
 * 参数为 `{ comm, req_0: { module, method, param } }`，以 GET data= 传入。
 *
 * 1.22.5 修正三处会把「已登录」判成「未登录」的问题：
 * 1. 网页登录有时只落 `qm_keyst` 不落 `uin`，原来要求 uin + key 同时存在，
 *    结果 isQQLoggedIn() 恒为 false，所有入口都显示「去登录」；
 * 2. 用户信息接口 GetLoginUserInfo 可用 authst 直接换出 uin，改成必要时主动反查；
 * 3. 收藏歌单 / 收藏专辑在未登录时返回 80050 / 80000，原来原样抛给页面，
 *    用户只看到一串数字，现在统一翻译成「登录已失效」。
 */

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PAGE_SIZE = 100
const UIN_KEYS = ['uin', 'qqmusic_uin', 'wxuin', 'luin', 'p_uin']
/**
 * 播放密钥的优先级顺序。
 *
 * 注意：这里必须是「按优先级依次找」，不能用 `(?:a|b|c)=` 一次性匹配 ——
 * 网页登录会在同一个 Cookie 里同时写 p_skey（QQ 互联用）和 qm_keyst，
 * 一次匹配取的是字符串里先出现的那个，很容易把 p_skey 当成音乐密钥，
 * 结果所有接口都返回 1000 / 80000。
 */
const KEY_KEYS = ['qm_keyst', 'qqmusic_key', 'musickey', 'wxskey', 'p_skey', 'skey']

const getCookie = () => settingState.setting['platform.txCookie'] ?? ''

/** 从 Cookie 里取 uin（QQ 号），兼容 o0123456789 与纯数字两种写法 */
export const getUinFromCookie = (cookie = getCookie()) => {
  for (const key of UIN_KEYS) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))
    if (!match) continue
    const raw = match[1].trim()
    // euin 之类的加密串不是 QQ 号，这里只认纯数字 / o 前缀数字
    if (!/^o?\d{4,}$/.test(raw)) continue
    return raw.replace(/^o/, '')
  }
  return ''
}

/** 从 Cookie 里取播放密钥（musickey），comm.authst 用；按优先级取第一个非空 */
export const getKeyFromCookie = (cookie = getCookie()) => {
  for (const key of KEY_KEYS) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))
    if (match && match[1].trim()) return match[1].trim()
  }
  return ''
}

/**
 * 从 Cookie 里取加密 uin（euin）。
 *
 * 收藏专辑接口 AlbumFavRead 要的是这个加密串，传纯数字 uin 会直接返回 80000。
 * 网页登录一般都写这个字段，取不到再退回数字 uin。
 */
export const getEuinFromCookie = (cookie = getCookie()) => {
  const match = cookie.match(/(?:^|;\s*)euin=([^;]+)/)
  if (!match) return ''
  const raw = match[1].trim()
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Cookie 里是否存了登录凭证。
 *
 * 这里只代表「有凭证、值得去试」，不代表凭证一定有效：
 * 网页登录可能写入 p_skey（QQ 互联用）之类的非音乐密钥，
 * 拿去请求 musicu 会返回 1000。真实有效性交给 GetLoginUserInfo 校验，
 * 界面按校验结果展示，避免「显示已登录、点进去全报错」。
 */
export const hasTxSession = (cookie = getCookie()) => {
  if (!cookie) return false
  return /(?:^|;\s*)(?:qm_keyst|qqmusic_key|musickey|wxskey|p_skey|skey)=[^;\s]/.test(cookie)
}

const describeCode = (code) => {
  if (code == 10006) return 'QQ 音乐接口繁忙，请稍后重试'
  // 1000 / 1001 才是明确的「凭证无效」
  if (code == 1000 || code == 1001) return `QQ 音乐登录已失效，请重新登录（${code}）`
  // 80000 / 80050 也可能是接口参数被拒，不能一律说成没登录，否则用户会反复重登
  if (code == 80000 || code == 80050) return `QQ 音乐拒绝了本次请求（${code}），请重新登录后再试`
  if (code == 104403) return 'QQ 音乐该功能当前不可用（104403）'
  return `QQ 音乐接口错误（${code}）`
}

/**
 * 组装请求公共参数 comm
 *
 * 对齐 APK 里的 `buildQQComm`：除版本号外还带设备信息与 QIMEI。
 * QIMEI 取不到时用内置默认值，不阻塞请求。
 */
const buildComm = async(extra = {}, cookie = getCookie(), uin = '') => {
  const device = getQQDevice()
  const qimei = await getQQQimei().catch(() => ({ q16: '', q36: '' }))
  const realUin = uin || getUinFromCookie(cookie)
  return {
    ct: 11,
    cv: 14090008,
    v: 14090008,
    chid: '10003505',
    qq: realUin || null,
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
 * @param {object} comm 额外 comm 参数
 * @param {string} cookie 指定 Cookie，默认取设置里的
 * @param {string} uin 指定 uin（反查出来的），默认从 Cookie 取
 */
const send = async(module, method, param, comm = {}, cookie = getCookie(), uin = '') => {
  const data = {
    comm: await buildComm(comm, cookie, uin),
    req_0: { module, method, param },
  }
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
  if (payload.code !== 0 && payload.code !== undefined) {
    throw new Error(payload.msg || describeCode(payload.code))
  }
  return payload.req_0 ?? {}
}

/**
 * 用 authst 换登录用户信息。
 * 网页登录拿不到 uin 时靠它补齐，同时用来做「Cookie 是否真的有效」的校验。
 */
/** 用对象包一层，避免 lint 的 require-atomic-updates 误判 */
const loginInfoCache = { cookie: '', value: null }

export const getLoginUserInfo = async(cookie = getCookie()) => {
  if (!cookie || !hasTxSession(cookie)) return null
  if (loginInfoCache.cookie === cookie && loginInfoCache.value) return loginInfoCache.value
  const req = await send('music.UserInfo.userInfoServer', 'GetLoginUserInfo', {}, {}, cookie)
  if (req.code !== 0 || !req.data) return null
  const data = req.data
  const value = {
    uin: String(data.uin ?? data.qq ?? '').replace(/^o/, ''),
    nickname: data.nick ?? data.nickname ?? data.name ?? '',
    avatar: data.headpic ?? data.avatarUrl ?? data.avatar ?? '',
    vipType: Number(data.vipType ?? data.vip_type ?? 0),
  }
  loginInfoCache.cookie = cookie
  loginInfoCache.value = value
  return value
}

export const clearTxCache = () => {
  loginInfoCache.cookie = ''
  loginInfoCache.value = null
}

/** 拿 uin：Cookie 里有就用，没有就用 authst 反查 */
const ensureUin = async(cookie = getCookie()) => {
  const fromCookie = getUinFromCookie(cookie)
  if (fromCookie) return fromCookie
  const info = await getLoginUserInfo(cookie).catch(() => null)
  return info?.uin ?? ''
}

/**
 * 用 songid 批量换歌曲详情。
 * 推荐流里给的是 `{type: 200, id: <songid>}` 这种卡片，
 * 必须再调 CgiGetTrackInfo 才能拿到 mid / 歌手 / 专辑。
 */
/**
 * 一次最多带多少个 songid。
 * fcg 接口对逗号分隔的 songid 数量有上限，50 实测稳定。
 */
const TRACK_BATCH_SIZE = 50

/**
 * 用 songid 批量换歌曲详情。
 *
 * 1.22.6 修正：原实现走 `music.trackInfo.UniformRuleCtrl / CgiGetTrackInfo`，
 * 该接口对未授权请求恒返回 **10006**（实测单个 id 也 10006），
 * 于是「每日推荐 / 主页推荐 / 推荐新歌 / 猜你喜欢」四个入口
 * 虽然能拿到卡片 id，却换不出歌曲，最终全部是空列表。
 *
 * 改用 c.y.qq.com 的 `fcg_play_single_song`：songid 用逗号拼一串，
 * 一次最多 50 个，返回体自带 mid / 歌手 / 专辑 / 各档音质大小，实测稳定。
 */
const getTracksByIds = async(ids, cookie = getCookie()) => {
  const list = []
  for (let i = 0; i < ids.length; i += TRACK_BATCH_SIZE) {
    const part = ids.slice(i, i + TRACK_BATCH_SIZE)
    const requestObj = httpFetch(
      'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg' +
      `?songid=${part.join(',')}&platform=yqq&format=json`,
      {
        method: 'get',
        headers: {
          'User-Agent': DESKTOP_UA,
          Referer: 'https://y.qq.com/',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
    )
    const { body } = await requestObj.promise
    if (!body || body.code !== 0) {
      throw new Error(`QQ 音乐获取歌曲失败（${body?.code ?? '网络异常'}）`)
    }
    list.push(...(body.data ?? []))
  }
  return toMusicList(list)
}

/**
 * 取推荐流歌曲
 *
 * direction 才是「换一批内容」的开关，page 传 2 及以上恒为空数组。
 * @param {number} direction 0 主页 / 1 每日 / 2 猜你喜欢 / 3 新歌
 */
const getFeedSongs = async(direction, cookie = getCookie()) => {
  const req = await send('music.recommend.RecommendFeed', 'get_recommend_feed', {
    direction,
    page: 1,
    s_num: 0,
    v_cache: [],
  }, {}, cookie)
  if (req.code !== 0) throw new Error(describeCode(req.code))

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

/**
 * 从 `file` 字段解析各档音质大小。
 * fcg 接口会直接给 size_128mp3 / size_320mp3 / size_flac / size_hires，
 * 解析出来列表里就能正常显示音质标签，而不是清一色「未知」。
 */
const buildTypes = (file) => {
  const types = []
  const _types = {}
  const add = (type, size) => {
    if (!size) return
    const text = sizeFormate(size)
    types.push({ type, size: text })
    _types[type] = { size: text }
  }
  if (file) {
    add('128k', file.size_128mp3)
    add('320k', file.size_320mp3)
    add('flac', file.size_flac)
    add('flac24bit', file.size_hires)
  }
  if (!types.length) {
    types.push({ type: '128k', size: 'unknown' }, { type: '320k', size: 'unknown' }, { type: 'flac', size: 'unknown' })
    _types['128k'] = { size: 'unknown' }
    _types['320k'] = { size: 'unknown' }
    _types.flac = { size: 'unknown' }
  }
  return { types, _types }
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
  const { types, _types } = buildTypes(info.file)
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
    _types,
  }
}

const toMusicList = (list) => list.map(toMusicInfo).filter(Boolean)

export default {
  // ---------------------------------------------------------------- 账号数据

  /**
   * 推荐歌单（歌单广场精选）
   *
   * 公开接口，未登录也能取到。
   * 返回的是「推荐卡片」，歌单本体在 `Playlist.basic` 里 ——
   * id 字段是 `tid`，封面在 `basic.cover.medium_url`，
   * 直接读顶层的 tid / cover 会全部拿到 undefined。
   */
  async getRecommendPlaylists(from = 0, size = 30, cookie = getCookie()) {
    const req = await send('music.playlist.PlaylistSquare', 'GetRecommendWhole', {
      IsReqFeed: true,
      FeedReq: { From: from, Size: size },
    }, { cv: 1602, ct: 20 }, cookie)
    if (req.code !== 0) throw new Error(describeCode(req.code))
    const list = req.data?.FeedRsp?.List ?? []
    return list.map((item) => {
      const basic = item?.Playlist?.basic
      if (!basic || !basic.tid) return null
      const cover = basic.cover ?? {}
      return {
        id: String(basic.tid),
        tid: basic.tid,
        name: basic.title ?? '',
        cover: cover.medium_url || cover.big_url || cover.small_url || cover.default_url || '',
        songCount: basic.song_cnt ?? basic.songnum ?? 0,
        desc: basic.desc ?? '',
        creator: basic.creator?.nick ?? '',
        isFavorites: false,
      }
    }).filter(Boolean)
  },

  /**
   * 我创建的歌单（含「我喜欢」，dirId=201）
   *
   * 和收藏歌单是同一套 musicasset 鉴权，身份字段同样按 euin → uin → 只靠 authst
   * 依次试；三种都被拒时把最后一个错误码翻译出去。
   */
  async getCreatedPlaylists(uin, cookie = getCookie()) {
    const realUin = uin || await ensureUin(cookie)
    if (!realUin) throw new Error('QQ 音乐登录已失效，请重新登录')
    const realEuin = getEuinFromCookie(cookie)

    const attempts = []
    if (realEuin) attempts.push({ euin: realEuin })
    attempts.push({ uin: String(realUin) })
    attempts.push({})

    let lastCode = 0
    for (const extra of attempts) {
      let req
      try {
        req = await send('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { ...extra }, {}, cookie, realUin)
      } catch {
        continue
      }
      if (req.code !== 0) {
        lastCode = req.code
        continue
      }
      const list = req.data?.v_playlist ?? []
      return list.map(item => ({
        // 不同版本的接口对歌单 id 的字段名不一致（tid / dissid），两个都认
        id: String(item.tid ?? item.dissId ?? item.dissid ?? ''),
        tid: item.tid ?? item.dissId ?? item.dissid,
        dirid: item.dirId,
        name: item.dirName,
        cover: item.picUrl || item.bigpicUrl || '',
        songCount: item.songNum ?? 0,
        desc: item.desc ?? '',
        isFavorites: item.dirId == 201,
      }))
    }
    throw new Error(describeCode(lastCode || 80050))
  },

  /**
   * 收藏的歌单
   *
   * `PlaylistFavRead` 和 `AlbumFavRead` 一样挑身份字段：
   * 网页登录落下来的 Cookie 里，只有加密 euin 能过校验，传纯数字 uin 容易被拒（80050）。
   * 所以按 euin → uin → 只靠 authst 依次试，全失败再退回网页版「我的收藏」接口。
   * 网页接口只看 uin + Cookie，是另一条独立的通路，能兜住 musicasset 全线被拒的情况。
   */
  async getFavPlaylists(begin = 0, num = PAGE_SIZE, uin, cookie = getCookie()) {
    const realUin = uin || await ensureUin(cookie)
    if (!realUin) throw new Error('QQ 音乐登录已失效，请重新登录')
    const realEuin = getEuinFromCookie(cookie)

    const attempts = []
    if (realEuin) attempts.push({ euin: realEuin })
    attempts.push({ uin: String(realUin) })
    attempts.push({})

    let lastCode = 0
    for (const extra of attempts) {
      let req
      try {
        req = await send('music.musicasset.PlaylistFavRead', 'CgiGetPlaylistFavInfo', {
          offset: begin,
          size: num,
          ...extra,
        }, {}, cookie, realUin)
      } catch {
        // 顶层 code 非 0（凭证无效等）也是「这种身份字段不行」，继续试下一种
        continue
      }
      if (req.code !== 0) {
        lastCode = req.code
        continue
      }
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
    }

    const web = await this.getFavPlaylistsFromWeb(realUin, begin, num, cookie).catch(() => null)
    if (web) return web
    throw new Error(describeCode(lastCode || 80050))
  },

  /**
   * 网页版「我的收藏 - 收藏的歌单」
   *
   * `fcg_get_profile_order_asset.fcg?reqtype=2` 是 y.qq.com 个人主页用的老接口，
   * 只校验 uin + Cookie，不经过 musicasset 的鉴权链，作为兜底非常合适。
   * 返回 data.disslist，字段名与 musicasset 那套完全不同，单独映射一遍。
   */
  async getFavPlaylistsFromWeb(uin, begin = 0, num = PAGE_SIZE, cookie = getCookie()) {
    if (!uin) return null
    const url = 'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg' +
      `?ct=20&cid=205360956&userid=${encodeURIComponent(uin)}` +
      `&reqtype=2&sin=${begin}&size=${num}&format=json`
    const res = await httpFetch(url, {
      method: 'get',
      headers: {
        'User-Agent': DESKTOP_UA,
        Referer: 'https://y.qq.com/',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }).promise
    if (res.statusCode !== 200 || !res.body || typeof res.body !== 'object') return null
    // code 4000 / privacy 表示 uin 不对或不是本人，交给上层报原文
    if (res.body.code !== 0 || !res.body.data) return null
    const list = res.body.data.disslist ?? res.body.data.list ?? []
    if (!Array.isArray(list)) return null
    return list.map(item => ({
      id: String(item.dissid ?? item.tid ?? ''),
      tid: item.dissid ?? item.tid,
      dirid: item.dirid ?? item.dirId ?? 0,
      name: item.dissname ?? item.title ?? '',
      cover: item.logo ?? item.picurl ?? '',
      songCount: item.song_cnt ?? item.songnum ?? 0,
      desc: item.desc ?? '',
      creator: item.nickname ?? item.creator?.name ?? '',
      isFavorites: false,
    }))
  },

  /**
   * 收藏的专辑
   *
   * 这个接口要的是 Cookie 里的加密 euin，传纯数字 uin 会返回 80000。
   * 按 euin → uin → 只靠 authst 的顺序依次试，全失败才把最后一个错误码抛出去。
   */
  async getFavAlbums(begin = 0, num = PAGE_SIZE, uin, cookie = getCookie()) {
    const realUin = uin || await ensureUin(cookie)
    const realEuin = getEuinFromCookie(cookie)
    const attempts = []
    if (realEuin) attempts.push({ euin: realEuin })
    if (realUin) attempts.push({ uin: String(realUin) })
    attempts.push({})
    let lastCode = 0
    for (const extra of attempts) {
      let req
      try {
        req = await send('music.musicasset.AlbumFavRead', 'CgiGetAlbumFavInfo', {
          offset: begin,
          size: num,
          ...extra,
        }, {}, cookie, realUin)
      } catch {
        // 顶层 code 非 0 时 send 会抛，视为这一种身份字段不可用，继续下一个
        continue
      }
      if (req.code !== 0) {
        lastCode = req.code
        continue
      }
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
    }
    throw new Error(describeCode(lastCode || 80000))
  },

  /** 歌单 / 我喜欢 的歌曲列表 */
  async getPlaylistSongs(disstid, dirid = 0, cookie = getCookie()) {
    const id = Number.parseInt(disstid, 10)
    // 拿不到合法 id 时直接说清楚，避免发一个 NaN 给接口再抛出莫名其妙的错误
    if (!Number.isFinite(id) || id <= 0) throw new Error('QQ 音乐歌单 ID 无效，请返回重新进入')
    const req = await send('music.srfDissInfo.DissInfo', 'CgiGetDiss', {
      disstid: id,
      dirid: Number(dirid) || 0,
      tag: true,
      song_begin: 0,
      song_num: 999999,
      userinfo: true,
      orderlist: true,
      onlysonglist: false,
    }, {}, cookie)
    if (req.code !== 0) throw new Error(describeCode(req.code))
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
    const playlists = await this.getCreatedPlaylists(undefined, cookie)
    const liked = playlists.find(item => item.isFavorites) ?? playlists.find(item => item.dirid == 201)
    // 没有「我喜欢」歌单是正常的（新账号），返回空而不是报错
    if (!liked) return []
    return this.getPlaylistSongs(liked.tid, 201, cookie)
  },

  /** 每日推荐 */
  async getDailyRecommend(cookie = getCookie()) {
    return getFeedSongs(1, cookie)
  },

  /** 猜你喜欢 */
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
    if (req.code !== 0) throw new Error(describeCode(req.code))
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
