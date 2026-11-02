import { toMD5 } from '@/utils/tools'

/**
 * 酷狗接口签名（Android 协议）
 *
 * 来源：Walnut 版 APK v26.09.28 的 `utils/musicSdk/kg/sign`：
 *   sign = md5(SIGN_SALT + 按 key 升序拼好的 k=v + SIGN_SALT)
 * 其中对象值要先 JSON.stringify。
 */

export const SIGN_SALT = 'OIlwieks28dk2k092lksi2UIkp'

/** 固定请求头，缺了会被网关判定为非客户端 */
export const buildHeaders = () => ({
  'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
  'kg-rc': '1',
  'kg-thash': '5d816a0',
  'kg-rec': '1',
  'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
})

/**
 * @param {Record<string, any>} params 参与签名的参数
 * @param {string} extra 追加在中间的串（部分接口传 body）
 */
export const signParams = (params, extra = '') => {
  const text = Object.keys(params).sort().map((key) => {
    const value = params[key]
    return `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`
  }).join('')
  return toMD5(`${SIGN_SALT}${text}${extra}${SIGN_SALT}`)
}

/** 生成一个 32 位设备号（没有真实设备号时用于 mid） */
export const createMid = () => {
  let mid = ''
  for (let i = 0; i < 32; i++) mid += '0123456789abcdef'[Math.floor(Math.random() * 16)]
  return mid
}

export default signParams
