import { httpFetch } from '../../request'
import { buildHeaders, createMid, signParams } from './sign'
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
  const next = {
    mid,
    dfid: map.dfid ?? '-',
    userid: map.userid ?? map.userId ?? '',
    token: map.token ?? '',
    cookieStr: cookie || `mid=${mid}`,
  }
  cache.value = next
  return next
}

export const resetDeviceInfo = () => { cache.value = null }

export const hasKgSession = (cookie = getCookie()) => {
  if (!cookie) return false
  const map = parseCookie(cookie)
  return Boolean(map.userid && map.token)
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
  if (needAuth && !dev.token) throw new Error('请先登录酷狗音乐账号')

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

const toMusicInfo = (song) => {
  if (!song) return null
  const fileHash = song.hash ?? song.FileHash ?? song.filehash
  if (!fileHash) return null
  const singers = song.singerinfo ?? song.singer_name ?? song.SingerName ?? ''
  return {
    source: 'kg',
    songmid: fileHash,
    name: song.songname ?? song.SongName ?? song.filename ?? '',
    singer: Array.isArray(singers) ? singers.map(item => item.name).filter(Boolean).join('、') : String(singers).replace(/、$/, ''),
    // 酷狗字段是 time_length（秒），部分接口会给 duration
    interval: Number(song.time_length ?? song.timelength ?? song.duration ?? song.Duration ?? 0),
    albumId: song.album_id ?? song.AlbumID ?? '',
    albumName: song.album_name ?? song.AlbumName ?? '',
    img: (song.album_id ?? song.AlbumID) ? `https://imge.kugou.com/stdmusic/480/${song.album_id ?? song.AlbumID}.jpg` : '',
    types: [
      { type: '128k', size: 'unknown' },
      { type: '320k', size: 'unknown' },
      { type: 'flac', size: 'unknown' },
    ],
    _types: { '128k': { size: 'unknown' }, '320k': { size: 'unknown' }, flac: { size: 'unknown' } },
  }
}

const toMusicList = (list) => (list ?? []).map(toMusicInfo).filter(Boolean)

export default {
  /** 每日推荐（免登录，实测可用） */
  async getDailyRecommend() {
    const payload = await request('https://gateway.kugou.com/everyday_song_recommend', {
      router: 'everydayrec.service.kugou.com',
    })
    const songs = payload.data?.song_list ?? payload.data?.songs ?? []
    return toMusicList(songs)
  },

  /** 我创建的歌单 */
  async getMyPlaylists() {
    const dev = await getDeviceInfo()
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
    return list.map(item => ({
      id: String(item.listid ?? item.list_id ?? item.specialid ?? ''),
      name: item.listname ?? item.name ?? item.specialname ?? '',
      cover: item.imgurl ?? item.img ?? '',
      songCount: item.songcount ?? item.song_count ?? 0,
      desc: item.intro ?? item.remark ?? '',
      isFavorites: /喜欢/.test(item.listname ?? item.name ?? ''),
    }))
  },

  /** 歌单内的歌曲 */
  async getPlaylistSongs(listid, page = 1, pagesize = 300) {
    const payload = await request('https://gateway.kugou.com/v4/get_songs/v2', {
      body: {
        listid: String(listid),
        page,
        pagesize,
        areas: '',
        type: 0,
        mode: 1,
        personalRecommend: 1,
        allPlatform: 1,
        show_cover: 1,
      },
      extraParams: { plat: 1 },
    })
    const songs = payload.data?.songs ?? payload.data?.info ?? []
    return toMusicList(songs)
  },

  /** 我喜欢：在歌单列表里找「我喜欢」那个 */
  async getLikedSongs() {
    const playlists = await this.getMyPlaylists()
    const liked = playlists.find(item => item.isFavorites) ?? playlists[0]
    if (!liked) return []
    return this.getPlaylistSongs(liked.id)
  },
}
