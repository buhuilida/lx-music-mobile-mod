import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import { getWyUidCache, saveWyUidCache } from '@/utils/data'
import { toMD5 } from '@/utils/tools'
import settingState from '@/store/setting/state'
import neteaseActions from '@/store/netease/action'

// https://github.com/Binaryify/NeteaseCloudMusicApi

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'

const getCookie = () => settingState.setting['platform.wyCookie'] ?? ''

const getCsrf = (cookie) => (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

/**
 * 统一请求入口。
 * 之前移植过来的版本有一半接口没带 Cookie（关注歌手、收藏专辑），
 * 服务端一律按未登录处理，这里统一补上，避免再出现「登录了却提示未登录」。
 */
const post = (url, data = {}, cookie = getCookie()) => {
  if (!cookie) return Promise.reject(new Error('未设置Cookie'))
  const requestObj = httpFetch(url, {
    method: 'post',
    headers: {
      'User-Agent': UA,
      origin: 'https://music.163.com',
      Referer: 'https://music.163.com',
      cookie,
    },
    form: weapi({ ...data, csrf_token: getCsrf(cookie) }),
  })
  return requestObj.promise.then(({ body, statusCode }) => {
    if (statusCode !== 200) throw new Error(`请求失败（${statusCode}）`)
    if (body.code !== 200) throw new Error(body.message || body.msg || `接口返回 ${body.code}`)
    return body
  })
}

const retry = async(fn, retryNum = 0) => {
  try {
    return await fn()
  } catch (err) {
    if (retryNum >= 2) throw err
    await new Promise(resolve => setTimeout(resolve, 200))
    return retry(fn, retryNum + 1)
  }
}

/**
 * 把响应里的 Set-Cookie 拼成一条 cookie 字符串。
 * RN 的 fetch 在 Android 上会把多条 Set-Cookie 放进 headers['set-cookie']（数组），
 * iOS 可能是逗号拼接的单条字符串，这里两种都处理。
 */
const parseSetCookie = (headers) => {
  const raw = headers?.['set-cookie'] ?? headers?.['Set-Cookie']
  if (!raw) return ''
  const list = Array.isArray(raw) ? raw : String(raw).split(/,(?=[^;,]+=)/)
  return list
    .map(item => String(item).split(';')[0].trim())
    .filter(item => item.includes('='))
    .join('; ')
}

/**
 * 登录类请求：不要求已有 cookie（当前就是没有才要登录），
 * 返回值里带上响应下发的 cookie。
 */
const postWeapi = async(url, data, cookie = '') => {
  const requestObj = httpFetch(url, {
    method: 'post',
    headers: {
      'User-Agent': UA,
      origin: 'https://music.163.com',
      Referer: 'https://music.163.com',
      ...(cookie ? { cookie } : {}),
    },
    form: weapi({ ...data, csrf_token: getCsrf(cookie) }),
  })
  const { body, headers, statusCode } = await requestObj.promise
  if (statusCode !== 200) throw new Error(`请求失败（${statusCode}）`)
  return { body, cookie: parseSetCookie(headers) }
}

export default {
  /**
   * 用 Cookie 换账号 UID，同时缓存 VIP 状态
   */
  async getUid(cookie = getCookie(), retryNum = 0) {
    if (!cookie) return Promise.reject(new Error('未设置Cookie'))
    const hashedCookie = toMD5(cookie)
    if (!retryNum) {
      const cached = await getWyUidCache(hashedCookie)
      if (cached) {
        neteaseActions.setWyProfile({ uid: String(cached.uid), vipType: cached.vipType })
        return cached.uid
      }
    }
    try {
      const body = await post('https://music.163.com/weapi/w/nuser/account/get', {}, cookie)
      if (!body.account) throw new Error('登录已过期，请重新登录')
      const uid = body.account.id
      neteaseActions.setWyProfile({
        uid: String(uid),
        vipType: body.account.vipType ?? 0,
        nickname: body.profile?.nickname,
        avatarUrl: body.profile?.avatarUrl,
      })
      await saveWyUidCache(hashedCookie, String(uid), body.account.vipType ?? 0)
      return uid
    } catch (err) {
      if (retryNum >= 2) throw err
      await new Promise(resolve => setTimeout(resolve, 200))
      return this.getUid(cookie, retryNum + 1)
    }
  },

  async getProfile(uid) {
    const body = await post(`https://music.163.com/weapi/v1/user/detail/${uid}`)
    const profile = body.profile ?? {}
    neteaseActions.setWyProfile({
      uid: String(profile.userId ?? uid),
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      vipType: profile.vipType ?? 0,
      signature: profile.signature,
      follows: profile.follows,
      followeds: profile.followeds,
      playlistCount: profile.playlistCount,
    })
    return profile
  },

  /** 我喜欢的音乐（只要 ID 集合，用于红心状态） */
  async getLikedSongList(uid, cookie = getCookie()) {
    const body = await post('https://music.163.com/weapi/song/like/get', { uid: String(uid) }, cookie)
    return body.ids ?? []
  },

  /** 我创建 / 收藏的歌单 */
  async getUserPlaylists(uid, cookie = getCookie()) {
    const body = await post('https://music.163.com/weapi/user/playlist', { uid: String(uid), limit: 1000, offset: 0 }, cookie)
    return body.playlist ?? []
  },

  /** 关注的歌手（单页） */
  async getSublist(limit = 100, offset = 0, cookie = getCookie()) {
    const body = await retry(() => post('https://music.163.com/weapi/artist/sublist', { limit, offset, total: true }, cookie))
    return body.data ?? []
  },

  /** 关注的歌手（自动翻页） */
  async getAllSublist(cookie = getCookie()) {
    const all = []
    const limit = 100
    let offset = 0
    while (true) {
      const list = await this.getSublist(limit, offset, cookie)
      all.push(...list)
      if (list.length < limit) break
      offset += limit
    }
    return all
  },

  /** 收藏的专辑 */
  async getSubAlbumList(limit = 100, offset = 0, cookie = getCookie()) {
    const body = await retry(() => post('https://music.163.com/weapi/album/sublist', { limit, offset, total: true }, cookie))
    return body.data ?? []
  },

  /** 云盘歌曲 */
  async getCloudSongs(limit = 100, offset = 0, cookie = getCookie()) {
    const body = await post('https://music.163.com/weapi/v1/cloud/get', { limit, offset }, cookie)
    return body.data ?? []
  },

  /** 收藏 / 取消收藏单曲 */
  async likeSong(songId, like, cookie = getCookie()) {
    return post('https://music.163.com/weapi/song/like', {
      trackId: songId,
      like,
      time: 3,
      alg: 'itembased',
    }, cookie)
  },

  /** 关注 / 取关歌手 */
  async followSinger(id, isFollow, cookie = getCookie()) {
    return post(`https://music.163.com/weapi/artist/${isFollow ? 'sub' : 'unsub'}`, {
      artistId: id,
      artistIds: `[${id}]`,
    }, cookie)
  },

  /** 收藏 / 取消收藏专辑 */
  async subAlbum(id, isSub, cookie = getCookie()) {
    return post(`https://music.163.com/weapi/album/${isSub ? 'sub' : 'unsub'}`, { id }, cookie)
  },

  /** 收藏 / 取消收藏歌单 */
  async subPlaylist(id, isSub, cookie = getCookie()) {
    return post(`https://music.163.com/weapi/playlist/${isSub ? 'subscribe' : 'unsubscribe'}`, { id }, cookie)
  },

  /** 听歌打卡（用于每日推荐个性化） */
  async scrobble(songId, sourceId, duration, cookie = getCookie()) {
    return post('https://music.163.com/weapi/feedback/weblog', {
      logs: JSON.stringify([{
        action: 'play',
        json: {
          download: 0,
          end: 'playend',
          id: songId,
          sourceId,
          time: Math.round(duration),
          type: 'song',
          wifi: 0,
        },
      }]),
    }, cookie).catch(() => null)
  },

  /**
   * 二维码登录：获取 key
   * 返回的 key 用于生成 https://music.163.com/login?codekey=<key>
   */
  async getQrKey() {
    const requestObj = httpFetch('https://music.163.com/api/login/qrcode/unikey?type=1', {
      method: 'post',
      headers: {
        'User-Agent': UA,
        Referer: 'https://music.163.com/',
      },
    })
    const { body } = await requestObj.promise
    if (body.code !== 200 || !body.unikey) throw new Error('获取登录二维码失败')
    return body.unikey
  },

  /**
   * 轮询二维码状态
   * 801 等待扫码 / 802 待确认 / 803 成功（返回 cookie）/ 800 过期
   */
  async checkQrLogin(key) {
    const requestObj = httpFetch(`https://music.163.com/api/login/qrcode/client/login?key=${encodeURIComponent(key)}&type=1`, {
      method: 'get',
      headers: {
        'User-Agent': UA,
        Referer: 'https://music.163.com/',
      },
    })
    const { body } = await requestObj.promise
    if (body.code == 803) {
      const cookies = (body.cookies ?? []).join('; ')
      return { code: 803, cookie: cookies }
    }
    return { code: body.code ?? 800, message: body.message }
  },

  /**
   * 手机号登录（1.21.0）
   *
   * 两种方式都走 weapi：
   * - 密码：password 传 md5，服务端校验
   * - 验证码：captcha 传短信码（先用 sendPhoneCode 发）
   * 成功后 weapi 会通过 Set-Cookie 下发 MUSIC_U / __csrf，拼起来就是可用的 Cookie。
   */
  async sendPhoneCode(phone, countrycode = '86') {
    const { body } = await postWeapi('https://music.163.com/weapi/sms/captcha/sent', {
      cellphone: String(phone),
      ctcode: String(countrycode),
    })
    if (body.code !== 200) throw new Error(body.message || body.msg || '验证码发送失败')
    return true
  },

  async loginWithPhone({ phone, countrycode = '86', password = '', captcha = '' }) {
    const data = {
      phone: String(phone),
      countrycode: String(countrycode),
      rememberLogin: 'true',
    }
    if (captcha) data.captcha = String(captcha)
    else if (password) data.password = toMD5(String(password))
    else throw new Error('请填写密码或验证码')

    const { body, cookie } = await postWeapi('https://music.163.com/weapi/login/cellphone', data)
    if (body.code !== 200) {
      // 501/502 一般是账号或密码错误；503 是验证码错误
      throw new Error(body.message || body.msg || '登录失败')
    }
    if (!/(^|;\s*)MUSIC_U=/.test(cookie)) throw new Error('登录成功但没拿到凭据，请改用扫码登录')
    neteaseActions.setWyProfile({
      uid: String(body.account?.id ?? body.profile?.userId ?? ''),
      nickname: body.profile?.nickname,
      avatarUrl: body.profile?.avatarUrl,
      vipType: body.account?.vipType ?? 0,
    })
    return { cookie, profile: body.profile ?? {}, account: body.account ?? {} }
  },
}
