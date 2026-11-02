import { httpFetch } from '../../request'
import { aesCbcEncrypt, bytesToBase64, md5, rsaEncryptPkcs1, utf8Bytes } from './crypto'

/**
 * QQ 音乐 QIMEI 设备指纹
 *
 * 来源：Walnut 版 APK（v26.09.28）Hermes 字节码里的 `getQQQimei` / `createQQDevice`。
 * QQ 音乐的风控接口（发验证码、登录、部分写接口）会看 comm 里的 QIMEI / QIMEI36，
 * 缺这两个字段时容易被判定为环境异常。
 *
 * 链路：
 *   1. 本地造一份设备信息（机型 / Android 版本与 APK 里一致）
 *   2. 随机 16 字节做 AES-128-CBC 的 key 与 iv，加密设备信息 → extra
 *   3. 同一份随机字节用厂商 RSA 公钥加密 → key
 *   4. 拼 md5 签名，POST 到 api.tencentmusic.com 换 q16 / q36
 *
 * 拿不到时返回内置的默认 q36，不阻塞登录（与 APK 的 fallback 行为一致）。
 */

const APP_ID = 'qimei_qq_android'
/** 参与 header sign 计算的固定串，APK 里与 appid 直接拼在一起 */
const APP_SECRET = 'pzAuCmaFAaFaHrdakPjLIEqKrGnSOOvH'
/** AES-128-CBC 的固定密钥 */
const AES_KEY = 'ZdJqM15EeO2zWc08'
/** 请求头 / 设备信息里声明的 AppKey */
const APP_KEY = '0AND0HD6FE4HY80F'
const RSA_PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEIxgwoutfwoJxcGQeedgP7FG9qaIuS0qzfR8gWkrkTZKM2iWHn2ajQpBRZjMSoSf6+KJGvar2ORhBfpDXyVtZCKpqLQ+FLkpncClKVIrBwv6PHyUvuCb0rIarmgDnzkfQAqVufEtR64iazGDKatvJ9y6B9NMbHddGSAUmRTCrHQIDAQAB'
/** APK 里接口失败时使用的兜底值 */
const DEFAULT_Q36 = '6c9d3cd110abca9b16311cee10001e717614'
const QIMEI_URL = 'https://api.tencentmusic.com/tme/trpc/proxy'

const randomHex = (len) => {
  let out = ''
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16)
  return out
}

/** 造一份与 APK 一致的设备信息，只生成一次 */
let deviceCache = null
const createDevice = () => {
  if (deviceCache) return deviceCache
  deviceCache = {
    androidId: randomHex(16),
    brand: 'Xiaomi',
    model: 'MI 6',
    imei: '86' + randomHex(13),
    fingerprint: 'xiaomi/iarim/sagit:10/eomam.200122.001/user/release-keys',
    openUdid: randomHex(32),
    sdk: 29,
    release: '10',
  }
  return deviceCache
}

export const getQQDevice = () => createDevice()

/**
 * 请求 QIMEI
 * @returns {Promise<{ q16: string, q36: string }>}
 */
const requestQimei = async() => {
  const device = createDevice()
  const nowSec = Math.floor(Date.now() / 1000)
  // 同一次请求里 key / iv 用同一段随机字节
  const aesKey = randomHex(16)
  const nonce = randomHex(16)

  const params = {
    androidId: device.androidId,
    platformId: 1,
    appKey: APP_KEY,
    appVersion: '14.9.0.8',
    brand: device.brand,
    channelId: '10003505',
    cid: '',
    imei: device.imei,
    imsi: '',
    mac: '',
    model: device.model,
    networkType: 'unknown',
    oaid: '',
    osVersion: `Android ${device.release},level ${device.sdk}`,
    qimei: '',
    qimei36: '',
    sdkVersion: '1.2.13.6',
    targetSdkVersion: '33',
    audit: '',
    userId: '{}',
    packageId: 'com.tencent.qqmusic',
    deviceType: 'Phone',
    sdkName: '',
    reserved: JSON.stringify({
      bod: device.brand,
      dv: device.model,
      manufact: device.brand,
      name: device.model,
      kernel: `Linux Android ${device.release}`,
    }),
  }
  const paramsText = JSON.stringify(params)

  // aesKey / nonce 都是十六进制 ASCII，按 UTF-8 取字节，不依赖 Buffer
  const keyBytes = utf8Bytes(aesKey)
  const plainBytes = utf8Bytes(paramsText)
  const keyB64 = bytesToBase64(rsaEncryptPkcs1(RSA_PUBLIC_KEY, keyBytes))
  const extra = bytesToBase64(aesCbcEncrypt(keyBytes, keyBytes, plainBytes))

  // sign = md5(key + params + time(ms) + nonce + 固定密钥 + extra + nonce)
  const sign = md5(`${keyB64}${paramsText}${nowSec * 1000}${nonce}${AES_KEY}${extra}${nonce}`)

  const requestObj = httpFetch(QIMEI_URL, {
    method: 'post',
    headers: {
      method: 'GetQimei',
      service: 'trpc.tme_datasvr.qimeiproxy.QimeiProxy',
      appid: APP_ID,
      sign: md5(`${APP_ID}${APP_SECRET}${nowSec}`),
      timestamp: String(nowSec),
      'User-Agent': 'QQMusic',
    },
    body: {
      app: 0,
      os: 1,
      qimeiParams: {
        key: keyB64,
        params,
        time: String(nowSec),
        nonce,
        sign,
        extra,
      },
    },
  })
  const res = await requestObj.promise
  const body = res.body
  if (!body) throw new Error('QIMEI 返回为空')
  // 服务端把结果塞在 data.data 里，形态不固定，逐层剥
  const pick = (obj) => {
    if (!obj || typeof obj !== 'object') return null
    if (obj.q36 || obj.q16) return obj
    return pick(obj.data)
  }
  const data = pick(body)
  if (!data) throw new Error(`QIMEI 返回字段不完整（${body.code ?? 'no code'}）`)
  return { q16: data.q16 || '', q36: data.q36 || DEFAULT_Q36 }
}

let qimeiPromise = null
let qimeiCache = null

/**
 * 取 QIMEI（进程内缓存，失败后不再重试）
 *
 * 首次调用最多等 3 秒，超时就先降级用默认值，避免拖慢第一个接口。
 */
export const getQQQimei = async() => {
  if (qimeiCache) return qimeiCache
  if (qimeiPromise) return qimeiPromise
  qimeiPromise = Promise.race([
    requestQimei(),
    new Promise((resolve, reject) => {
      setTimeout(() => { reject(new Error('QIMEI 请求超时')) }, 3000)
    }),
  ])
    .then((result) => {
      qimeiCache = result
      return result
    })
    .catch((err) => {
      console.log('ACCOUNT qimei_fallback platform=tx reason=' + (err?.message ?? 'unknown'))
      // 失败也给一份可用的默认值，避免每次请求都去试
      qimeiCache = { q16: '', q36: DEFAULT_Q36 }
      return qimeiCache
    })
    .then((result) => {
      qimeiPromise = null
      return result
    })
  return qimeiPromise
}

/** 退出登录时清掉缓存，换账号重新取 */
export const clearQimeiCache = () => {
  qimeiCache = null
  qimeiPromise = null
}
