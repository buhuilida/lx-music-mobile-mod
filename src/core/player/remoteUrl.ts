/**
 * 一起听的远程音频直链缓存
 *
 * 成员端没有对应音源（或音源解析失败）时，直接播放房主解析好的直链，
 * 这样「无音源也可以用」。放在独立模块里，避免 core/music 与 listenTogether 循环依赖。
 */

/** 直链有效期：部分音源 5~10 分钟就会过期，过期后回退到本地音源 */
const TTL = 10 * 60 * 1000

const cache = new Map<string, { url: string, at: number }>()

export const buildRemoteKey = (source: string, id: string) => `${source}_${id}`

export const setRemoteMusicUrl = (source: string, id: string, url: string) => {
  if (!url) return
  cache.set(buildRemoteKey(source, id), { url, at: Date.now() })
}

export const getRemoteMusicUrl = (source: string, id: string): string | null => {
  const key = buildRemoteKey(source, id)
  const item = cache.get(key)
  if (!item) return null
  if (Date.now() - item.at > TTL) {
    cache.delete(key)
    return null
  }
  return item.url
}

export const removeRemoteMusicUrl = (source: string, id: string) => {
  cache.delete(buildRemoteKey(source, id))
}

export const clearRemoteMusicUrl = () => {
  cache.clear()
}
