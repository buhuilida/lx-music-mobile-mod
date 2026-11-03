import { httpFetch } from '../../request'
import { sizeFormate } from '../../index'
import { buildHeaders, createMid, signParams } from './sign'
import { toMD5 } from '@/utils/tools'
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'

/**
 * 酷狗音乐账号能力（1.22.0）
 *
 * 还原自 Walnut 版 APK 的 `utils/musicSdk/kg/user`：
 * - 设备信息（mid / dfid / userid / token）从 Cookie 里拆出来，mid 没有时本地生成并持久化
 * - 所有网关请求都带 signature，算法见 ./sign
 * - 每日推荐是免登录接口，实测可直接返回 30 首
 *
 * 说明：酷狗的「手机号验证码登录」走的是 AES + RSA 双重加密（客户端 RSA 公钥 + 每次
 * 随机 AES key），接口还带风控头，这部分没有可靠的真机验证条件，所以这里不提供
 * 手机号登录，改为 Cookie 登录 —— Cookie 从酷狗 App/网页登录后取 `userid`、`token` 即可。
 */

const MID_KEY = '@kg_mid'

const getCookie = () => settingState.setting['platform.kgCookie'] ?? ''

// 用对象包一层，避免 lint 的 require-atomic-updates 误判
const cache = { value: null }

const parseCookie = (cookie) => {
  const result = {}
  for (const item of String(cookie || '').split(';')) {
    const index = item.indexOf('=')
    if (index < 0) continue
    const key = item.slice(0, index).trim()
    const value = item.slice(index + 1).trim()
    if (key) result[key] = value
  }
  return result
}

/**
 * 从 `KuGoo` 票据里拆 userid / token。
 *
 * 酷狗网页登录写的是 `KuGoo=<票据>`，票据是 kv 串（可能 URL 编码过），
 * 并不一定有独立的 userid / token 两个 cookie。
 * 只认独立字段会让网页登录永远显示「未登录」，也就是「登录了但全部提示去登录」。
 */
const parseKugooTicket = (raw) => {
  if (!raw) return {}
  const texts = [String(raw)]
  try { texts.push(decodeURIComponent(String(raw))) } catch {}
  for (const text of texts) {
    const userid = text.match(/(?:^|[&|;,])userid[=:](\d+)/i)?.[1]
    if (!userid) continue
    const token = text.match(/(?:^|[&|;,])token[=:]([0-9a-zA-Z_-]+)/i)?.[1]
    return { userid, token: token ?? '' }
  }
  return {}
}

export const getDeviceInfo = async(force = false) => {
  if (cache.value && !force) return cache.value
  const cached = await getData(MID_KEY)
  let mid = cached?.mid
  if (!mid) {
    mid = createMid()
    await saveData(MID_KEY, { mid })
  }
  const cookie = getCookie()
  const map = parseCookie(cookie)
  const ticket = parseKugooTicket(map.KuGoo ?? map.kugoo ?? map.kg_music)
  const next = {
    mid,
    dfid: map.dfid ?? '-',
    userid: map.userid ?? map.userId ?? ticket.userid ?? '',
    token: map.token ?? ticket.token ?? '',
    cookieStr: cookie || `mid=${mid}`,
  }
  cache.value = next
  return next
}

export const resetDeviceInfo = () => { cache.value = null }

export const hasKgSession = (cookie = getCookie()) => {
  if (!cookie) return false
  const map = parseCookie(cookie)
  if (map.userid && (map.token || map.KuGoo || map.kugoo)) return true
  const ticket = parseKugooTicket(map.KuGoo ?? map.kugoo ?? map.kg_music)
  return Boolean(ticket.userid)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 统一网关请求
 * @param {string} url 完整地址
 * @param {object} options
 * @param {object} options.body 请求体（会作为签名用 body 传给 signParams）
 * @param {object} options.extraParams 追加到 query 的参数
 * @param {string} options.router x-router 头（网关按它路由到具体服务）
 * @param {boolean} options.needAuth 是否要求登录
 */
const request = async(url, { body = {}, extraParams = {}, router, needAuth = false, cookie } = {}, retryNum = 0) => {
  const dev = await getDeviceInfo()
  // 网页登录可能只落 userid 不落 token，此时仍然值得请求一次（带 cookie 也能认证）
  if (needAuth && !dev.userid) throw new Error('请先登录酷狗音乐账号')

  const clienttime = Math.floor(Date.now() / 1000)
  const params = {
    dfid: dev.dfid,
    mid: dev.mid,
    uuid: '-',
    appid: '1005',
    clientver: '20489',
    clienttime,
    platform: 'ios',
    userid: Number(dev.userid) || 0,
    ...extraParams,
  }
  const hasBody = Object.keys(body).length > 0
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
  params.signature = signParams(params, hasBody ? bodyText : '')

  const query = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
  const headers = {
    ...buildHeaders(),
    ...(router ? { 'x-router': router } : {}),
    dfid: dev.dfid,
    mid: dev.mid,
    clienttime: String(clienttime),
    Cookie: cookie ?? (dev.cookieStr || `mid=${dev.mid}`),
  }
  if (hasBody) headers['Content-Type'] = 'application/json'

  const res = await httpFetch(`${url}?${query}`, {
    method: 'post',
    headers,
    // 传对象：request 层会 JSON.stringify 一次，传字符串会被二次转义
    ...(hasBody ? { body } : {}),
  }).promise

  const payload = res.body
  if (!payload || typeof payload !== 'object') throw new Error('酷狗返回异常')
  const code = payload.errcode ?? payload.error_code ?? 0
  if (code !== 0 && code !== 200) {
    // 签名过期 / 风控时会返回 20010 之类，重试一次
    if (retryNum < 1) {
      await sleep(300)
      resetDeviceInfo()
      return request(url, { body, extraParams, router, needAuth, cookie }, retryNum + 1)
    }
    throw new Error(payload.error || payload.errmsg || `酷狗接口错误（${code}）`)
  }
  return payload
}

/**
 * 从酷狗的 `filename`（形如「张国荣 - 似水流年」）里拆出歌手与歌名。
 *
 * 歌单接口只给 filename，不给 songname / singerinfo，
 * 不拆的话列表里「歌曲名」会整条显示成「歌手 - 歌名」。
 */
const splitFileName = (filename) => {
  const text = String(filename || '').trim()
  const index = text.indexOf(' - ')
  if (index < 0) return { singer: '', name: text }
  return { singer: text.slice(0, index).trim(), name: text.slice(index + 3).trim() }
}

/** 酷狗歌单接口直接给各档大小，解析出来才有音质标签 */
const buildTypes = (song) => {
  const types = []
  const _types = {}
  const add = (type, size) => {
    const num = Number(size)
    if (!num) return
    const text = sizeFormate(num)
    types.push({ type, size: text })
    _types[type] = { size: text }
  }
  add('128k', song.filesize)
  add('320k', song['320filesize'])
  add('flac', song.sqfilesize)
  if (!types.length) {
    types.push({ type: '128k', size: 'unknown' }, { type: '320k', size: 'unknown' }, { type: 'flac', size: 'unknown' })
    _types['128k'] = { size: 'unknown' }
    _types['320k'] = { size: 'unknown' }
    _types.flac = { size: 'unknown' }
  }
  return { types, _types }
}

const toMusicInfo = (song) => {
  if (!song) return null
  const fileHash = song.hash ?? song.FileHash ?? song.filehash
  if (!fileHash) return null
  const singers = song.singerinfo ?? song.singer_name ?? song.SingerName ?? ''
  const parsed = splitFileName(song.filename)
  const name = song.songname ?? song.SongName ?? parsed.name
  const singer = Array.isArray(singers)
    ? singers.map(item => item.name).filter(Boolean).join('、')
    : String(singers).replace(/、$/, '') || parsed.singer
  const albumId = song.album_id ?? song.AlbumID ?? ''
  const { types, _types } = buildTypes(song)
  return {
    source: 'kg',
    songmid: fileHash,
    name,
    singer,
    // 酷狗字段是 time_length / duration（秒）
    interval: Number(song.time_length ?? song.timelength ?? song.duration ?? song.Duration ?? 0),
    albumId,
    albumName: song.album_name ?? song.AlbumName ?? '',
    img: albumId ? `https://imge.kugou.com/stdmusic/480/${albumId}.jpg` : '',
    types,
    _types,
  }
}

const toMusicList = (list) => (list ?? []).map(toMusicInfo).filter(Boolean)

/** 酷狗歌单对象 → 应用内结构（推荐 / 创建 / 收藏三个接口字段一致） */
const toPlaylistItem = (item) => {
  if (!item) return null
  const id = item.specialid ?? item.global_specialid ?? item.listid ?? item.list_id ?? item.global_collection_id
  if (!id) return null
  const cover = String(item.imgurl ?? item.img ?? item.pic ?? '')
  return {
    id: String(id),
    name: item.specialname ?? item.listname ?? item.name ?? '',
    // 酷狗封面地址带 {size} 占位，不替换会 404
    cover: cover ? cover.replace('{size}', '480') : '',
    songCount: item.songcount ?? item.song_count ?? 0,
    desc: item.intro ?? item.remark ?? '',
    creator: item.username ?? item.nickname ?? '',
    playCount: item.playcount ?? 0,
    isFavorites: /喜欢/.test(item.specialname ?? item.listname ?? item.name ?? ''),
  }
}

const toPlaylistList = (list) => (list ?? []).map(toPlaylistItem).filter(Boolean)

/** 酷狗移动版歌单页：`info.list` 是收藏的歌单，`list.list` 是创建的歌单 */
const fetchMobilePlist = async(uid) => {
  const dev = await getDeviceInfo()
  const requestObj = httpFetch(`https://m.kugou.com/plist/list/${uid}?json=true`, {
    method: 'get',
    headers: {
      'User-Agent': KG_WEB_UA,
      Referer: 'https://m.kugou.com/',
      Cookie: dev.cookieStr || `mid=${dev.mid}`,
    },
  })
  const { body } = await requestObj.promise
  return body ?? {}
}

/** 酷狗榜单歌曲（新歌速递等），公开接口 */
const fetchRankSongs = async(rankid, pagesize) => {
  const url = 'http://mobilecdnbj.kugou.com/api/v3/rank/song' +
    `?version=9108&ranktype=1&plat=0&pagesize=${pagesize}&area_code=1&page=1` +
    `&rankid=${rankid}&with_res_tag=0&show_portrait_mv=1`
  const requestObj = httpFetch(url, {
    method: 'get',
    headers: { 'User-Agent': KG_ANDROID_UA },
  })
  const { body } = await requestObj.promise
  if (!body || (body.errcode ?? 0) !== 0) {
    throw new Error(`酷狗榜单读取失败（${body?.errcode ?? '网络异常'}）`)
  }
  return toMusicList(body.data?.info ?? [])
}

/**
 * 酷狗 web 接口签名
 *
 * web 端和 Android 端用的是**两把不同的 key**（Android 是 OIlwieks...）。
 * web 侧要求把 query 按 `&` 切开、排序后再拼，缺了这一步服务端返回 20028。
 * 与 lxx 的 `signatureParams(params, 'web')` 一致。
 */
const WEB_SIGN_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const signWeb = (params) => toMD5(`${WEB_SIGN_KEY}${params.split('&').sort().join('')}${WEB_SIGN_KEY}`)

const KG_WEB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
/** 榜单接口只认 Android 端 UA，换成 iPhone 会返回空列表 */
const KG_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; HLK-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.102 Mobile Safari/537.36'

export default {
  /** 每日推荐（免登录，实测可用） */
  async getDailyRecommend() {
    const payload = await request('https://gateway.kugou.com/everyday_song_recommend', {
      router: 'everydayrec.service.kugou.com',
    })
    const songs = payload.data?.song_list ?? payload.data?.songs ?? []
    return toMusicList(songs)
  },

  /**
   * 我创建的歌单
   *
   * 1.22.6 修正：App 网关的 `v7/get_all_list` / `v2/get_all_list` 均已下线，
   * 所有路由组合都返回 404 / 502。改成先走移动版用户歌单页
   * `m.kugou.com/plist/list/<uid>`（网页登录的 cookie 可直接用），
   * 失败再退回网关，避免整块功能直接报错。
   */
  async getMyPlaylists() {
    const dev = await getDeviceInfo()
    if (!dev.userid) throw new Error('请先登录酷狗音乐账号')

    try {
      const body = await fetchMobilePlist(dev.userid)
      // `list.list.info` 是「我创建的歌单」。空数组也要认 —— 真的没有歌单时
      // 继续往下走会撞上已下线的网关接口，反而报 502。
      const list = body?.list?.list?.info
      if (Array.isArray(list)) return toPlaylistList(list)
    } catch (err) {
      console.log('KG getMyPlaylists mobile failed: ' + (err?.message ?? err))
    }

    const payload = await request('https://gateway.kugou.com/v7/get_all_list', {
      body: {
        userid: dev.userid,
        token: dev.token,
        total_ver: 979,
        type: 2,
        page: 1,
        pagesize: 100,
      },
      extraParams: {
        plat: 1,
        userid: Number(dev.userid) || 0,
        token: dev.token,
      },
      needAuth: true,
    })
    const list = payload.data?.info ?? payload.data?.list ?? []
    return toPlaylistList(list)
  },

  /**
   * 收藏的歌单
   *
   * 与「我创建的歌单」是同一个移动版页面，区别在返回体的位置：
   * `info.list` 是我收藏的，`list.list.info` 是我创建的。
   * 没有收藏时接口给 null，这里返回空数组而不是抛错。
   */
  async getFavPlaylists() {
    const dev = await getDeviceInfo()
    if (!dev.userid) throw new Error('请先登录酷狗音乐账号')
    const body = await fetchMobilePlist(dev.userid)
    const list = body?.info?.list ?? []
    return toPlaylistList(Array.isArray(list) ? list : [])
  },

  /**
   * 新歌速递
   *
   * 走酷狗「新歌榜」（rankid=8888），公开接口、每日更新。
   * 榜单接口只认 Android 端 UA，返回字段里有完整文件名与各档码率大小。
   */
  async getNewSongs(pagesize = 100) {
    return fetchRankSongs(8888, pagesize)
  },

  /**
   * 歌曲推荐（精选 / 怀旧 / 热门 歌单广场）
   *
   * `m.kugou.com/plist/index` 一次返回 30 张推荐歌单，共 600 张。
   * 封面地址是 `{size}` 占位模板，必须替换成具体尺寸。
   */
  async getRecommendPlaylists(pagesize = 30) {
    const requestObj = httpFetch('https://m.kugou.com/plist/index?json=true', {
      method: 'get',
      headers: { 'User-Agent': KG_WEB_UA, Referer: 'https://m.kugou.com/' },
    })
    const { body } = await requestObj.promise
    const list = body?.plist?.list?.info ?? []
    return toPlaylistList(Array.isArray(list) ? list.slice(0, pagesize) : [])
  },

  /**
   * 歌单内的歌曲
   *
   * 1.22.6 修正：原实现走 `gateway.kugou.com/v4/get_songs/v2`，
   * 该地址已经下线 —— 任何参数都返回 502，于是「我喜欢」「我的歌单」
   * 点进去永远是空列表。
   *
   * 改用 mobiles.kugou.com 的 `v5/special/song`（web 签名），
   * 实测可取回完整歌单，字段是 filename / hash / duration / filesize。
   */
  async getPlaylistSongs(listid, pagesize = 100) {
    const id = String(listid ?? '').trim()
    if (!id) throw new Error('酷狗歌单 ID 为空')
    const songs = []
    for (let page = 1; page <= 50; page++) {
      const t = String(Date.now())
      const params = `appid=1058&specialid=${id}&page=${page}&pagesize=${pagesize}` +
        `&srcappid=2919&clientver=20000&clienttime=${t}&mid=${t}&uuid=${t}&dfid=-`
      const requestObj = httpFetch(
        `https://mobiles.kugou.com/api/v5/special/song?${params}&signature=${signWeb(params)}`,
        {
          method: 'get',
          headers: {
            'User-Agent': KG_WEB_UA,
            Referer: 'https://m3ws.kugou.com/share/index.php',
            mid: t,
            dfid: '-',
            clienttime: t,
          },
        },
      )
      const { body } = await requestObj.promise
      if (!body || (body.errcode ?? 0) !== 0) {
        throw new Error(`酷狗歌单读取失败（${body?.errcode ?? '网络异常'}）`)
      }
      const list = body.data?.info ?? []
      songs.push(...list)
      // 返回条数不足一页即到底
      if (list.length < pagesize) break
    }
    return toMusicList(songs)
  },

  /**
   * 我喜欢：在歌单列表里找「我喜欢」那个。
   * 找不到就返回空 —— 之前拿 playlists[0] 兜底，会把别的歌单冒充成「我喜欢」。
   */
  async getLikedSongs() {
    const playlists = await this.getMyPlaylists()
    const liked = playlists.find(item => item.isFavorites)
    if (!liked) return []
    return this.getPlaylistSongs(liked.id)
  },
}
