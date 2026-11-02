import settingState from '@/store/setting/state'

/**
 * 在线歌单链接解析（1.19.0）
 *
 * 各平台分享出来的歌单链接格式五花八门，这里统一抽出 (source, id)，
 * 之后交给 SonglistDetail 页面复用已有的加载/播放/收藏逻辑。
 */

export interface ParsedPlaylist {
  source: LX.OnlineSource
  /** 交给 SDK 的 id（网易私密歌单会带 ###token） */
  id: string
  /** 纯歌单 id，用于展示与去重 */
  rawId: string
}

const SOURCE_HOSTS: Array<[LX.OnlineSource, RegExp]> = [
  ['wy', /music\.163\.com|163cn\.tv|y\.music\.163\.com/i],
  ['tx', /y\.qq\.com|i\.y\.qq\.com|qq\.com\/n\/ryqq/i],
  ['kg', /kugou\.com|kugou\.cn/i],
]

const ID_PATTERNS: Record<string, RegExp[]> = {
  wy: [
    /[?&#]id=(\d{4,})/i,
    /\/playlist\/(\d{4,})/i,
    /\/discover\/toplist\/(\d{4,})/i,
  ],
  tx: [
    /[?&](?:id|disstid)=(\d{4,})/i,
    /\/playlist\/(\d{4,})/i,
    /\/taoge\/(\d{4,})/i,
  ],
  kg: [
    // 酷狗歌单：/yy/special/single/1234567.html
    /special\/single\/(\d{3,})/i,
    /[?&](?:specialid|global_collection_id|listid|id)=([A-Za-z0-9_-]{4,})/i,
    /\/(?:special|list)\/([A-Za-z0-9_-]{4,})/i,
  ],
}

/** 从网易 Cookie 中取 MUSIC_U 值（网易 SDK 用它访问私密歌单） */
export const extractWyToken = (cookie: string) => {
  if (!cookie) return ''
  const match = /MUSIC_U=([^;]+)/.exec(cookie)
  return match ? match[1].trim() : cookie.trim()
}

/** 网易云歌单 id 需要带上 MUSIC_U 才能读取私密歌单 */
export const buildSdkId = (source: LX.OnlineSource, rawId: string) => {
  if (source != 'wy') return rawId
  const token = extractWyToken(settingState.setting['platform.wyCookie'] ?? '')
  return token ? `${rawId}###${token}` : rawId
}

/**
 * 纯解析：只识别来源与歌单 id，不读设置（方便单测与复用）
 */
export const parsePlaylistLink = (input: string): { source: LX.OnlineSource, rawId: string } | null => {
  const text = input.trim()
  if (!text) return null

  // 手动前缀：wy:123 / tx:456 / kg:abc
  const prefixed = /^(wy|tx|kg)\s*[:：]\s*(\S+)$/i.exec(text)
  if (prefixed) {
    return { source: prefixed[1].toLowerCase() as LX.OnlineSource, rawId: prefixed[2] }
  }

  let source: LX.OnlineSource | null = null
  for (const [val, rxp] of SOURCE_HOSTS) {
    if (rxp.test(text)) {
      source = val
      break
    }
  }
  if (!source) return null

  for (const rxp of ID_PATTERNS[source] ?? []) {
    const match = rxp.exec(text)
    if (match) return { source, rawId: match[1] }
  }

  // 兜底：链接里最后一段足够长的数字/字母组合
  const fallback = /([A-Za-z0-9_-]{4,})\/?(?:[?#].*)?$/.exec(text.replace(/\/$/, ''))
  if (fallback) {
    const rawId = fallback[1]
    if (/^[a-z]+$/i.test(rawId)) return null
    return { source, rawId }
  }
  return null
}

/** 解析并补上平台账号信息（网易私密歌单需要 MUSIC_U） */
export const parsePlaylistInput = (input: string): ParsedPlaylist | null => {
  const parsed = parsePlaylistLink(input)
  if (!parsed) return null
  return { ...parsed, id: buildSdkId(parsed.source, parsed.rawId) }
}

export const SOURCE_LABELS: Record<string, string> = {
  wy: '网易云音乐',
  tx: 'QQ 音乐',
  kg: '酷狗音乐',
}
