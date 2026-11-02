/**
 * QQ 音乐接口签名（zzcSign）
 *
 * 来源：从 Walnut 版 APK（v26.09.28）的 Hermes 字节码还原，
 * 对应模块 `utils/musicSdk/tx/sign` 里的 `zzcSign`。
 *
 * 算法本身是纯 JS，不依赖任何 native 库：
 *   1. sha1(JSON 字符串) 取大写 hex
 *   2. 按固定下标从 hex 里取两段：前段 7 位、后段 8 位
 *   3. 用 20 字节的表与 hex 前 40 位逐字节异或，结果做 base64 并去掉 / + =
 *   4. 拼成 'zzc' + 前段 + base64 + 后段，整体转小写
 *
 * 已用真实接口验证：musicu.fcg 返回 code 0。
 */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const utf8Bytes = (str) => {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对（emoji 等），转成 4 字节
      const next = str.charCodeAt(++i)
      const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

const sha1Hex = (str) => {
  const msg = utf8Bytes(str)
  const bitLen = msg.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  // 长度按 64 位大端补齐
  for (let i = 7; i >= 0; i--) msg.push((bitLen / Math.pow(2, i * 8)) & 0xff)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Array(80)
  for (let block = 0; block < msg.length; block += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (msg[block + i * 4] << 24) | (msg[block + i * 4 + 1] << 16) | (msg[block + i * 4 + 2] << 8) | msg[block + i * 4 + 3]
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (n << 1) | (n >>> 31)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t | 0
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const hex = [h0, h1, h2, h3, h4]
    .map(n => ((n >>> 0).toString(16).padStart(8, '0')))
    .join('')
  return hex.toUpperCase()
}

const base64FromBytes = (bytes) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined
    out += B64_CHARS[b0 >> 2]
    out += B64_CHARS[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 0x3f]
  }
  return out
}

const FRONT_IDX = [23, 14, 6, 36, 16, 7, 19]
const BACK_IDX = [16, 1, 32, 12, 19, 27, 8, 5]
const XOR_TABLE = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

const pick = (hex, idxs) => idxs.map(i => hex[i]).join('')

/**
 * @param {string} text 请求体 JSON 字符串
 * @returns {string} sign 参数
 */
export const zzcSign = (text) => {
  const hex = sha1Hex(text)
  const front = pick(hex, FRONT_IDX)
  const back = pick(hex, BACK_IDX)
  const bytes = XOR_TABLE.map((n, i) => n ^ parseInt(hex.slice(i * 2, i * 2 + 2), 16))
  const body = base64FromBytes(bytes).replace(/[/+=]/g, '')
  return `zzc${front}${body}${back}`.toLowerCase()
}

export default zzcSign
