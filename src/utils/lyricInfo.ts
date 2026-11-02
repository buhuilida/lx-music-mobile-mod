import { parseWordLyric, buildAutoWordLyric, hasWordTags } from '@/utils/wordLyric'

/**
 * ColorOS / OPlus 系统歌词 payload 生成（纯函数，便于单测）
 *
 * 契约：MediaMetadata["lyricInfo"] = JSON 字符串
 * 文档：ColorOS-Live-Lyrics-Bridge 《播放器接入协议》
 *
 * 关键点：
 * - `lyricType` / `noLyric` 必须齐全，缺了 ColorOS 不认；
 * - `lyric` 必须是绝对毫秒时间轴（`[mm:ss.mmm]`）；
 * - `rawLyric` 用绝对时间的逐字标签，没有逐字歌词时不伪造；
 * - payload 不能过大，否则 MediaSession.setMetadata 会触发 Binder 事务超限。
 */

export const PROVIDER_PACKAGE = 'cn.toside.music.mobile'

/**
 * 单条 payload 上限。
 * MediaSession.setMetadata 通过 Binder 送到 system_server，Parcel 缓冲只有 1MB 且进程内共享，
 * 歌词 JSON 过大时会抛 TransactionTooLargeException（RuntimeException → 未捕获 → 直接崩）。
 * 64KB 足够放完 400 行逐字 + 翻译歌词，又远离 Binder 边界。
 */
export const MAX_PAYLOAD_BYTES = 64 * 1024

const timedLrcRxp = /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?]/
const anyTimeTagRxp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]/g

const pad = (num: number, len: number) => String(num).padStart(len, '0')

/** 毫秒 → `mm:ss.mmm` */
export const msToLrcTag = (ms: number) => {
  const total = Math.max(0, Math.round(ms))
  return `[${pad(Math.floor(total / 60000), 2)}:${pad(Math.floor(total % 60000 / 1000), 2)}.${pad(total % 1000, 3)}]`
}

/** 任意 LRC 时间轴统一成 `mm:ss.mmm`（ColorOS 只按毫秒解析） */
export const normalizeTimedLrc = (lrc: string): string => {
  if (!lrc) return ''
  const out: string[] = []
  for (const rawLine of lrc.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim()
    if (!line) continue
    const tags: number[] = []
    anyTimeTagRxp.lastIndex = 0
    let match: RegExpExecArray | null
    // 一行可能带多个时间标签：逐个展开
    while ((match = anyTimeTagRxp.exec(line)) != null) {
      const min = parseInt(match[1], 10)
      const sec = parseInt(match[2], 10)
      const frac = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
      tags.push(min * 60000 + sec * 1000 + frac)
      if (match.index !== 0) break
    }
    if (!tags.length) continue
    const text = line.replace(anyTimeTagRxp, '').trim()
    if (!text) continue
    for (const time of tags) out.push(`${msToLrcTag(time)}${text}`)
  }
  return out.join('\n')
}

/**
 * 逐字歌词 → 绝对时间的增强 LRC
 * 输入：洛雪逐字 `[00:12.34]<0,200>我` 或 A2 `[00:12.34]我<00:12.34>爱`
 * 输出：`[00:12.340]<00:12.340>我<00:12.540>的...<00:14.100>`
 */
export const buildRawWordLyric = (lrc: string, wordLyric?: string): string => {
  let source = wordLyric ?? ''
  if (!source) {
    // 没有逐字源时不伪造，只有歌词本身带逐字标签才解析
    if (!hasWordTags(lrc)) return ''
    source = lrc
  }
  const lines = parseWordLyric(source)
  if (!lines.length) return ''
  const out: string[] = []
  for (const line of lines) {
    if (!line.words.length) continue
    let body = msToLrcTag(line.time)
    for (const word of line.words) body += `<${msToLrcTag(word.time).slice(1, -1)}>${word.text}`
    // 最后一个字的结束点：系统据此判断扫光结束
    const last = line.words[line.words.length - 1]
    const endTime = Math.max(last.time + (last.duration || 0), line.time + 1)
    body += `<${msToLrcTag(endTime).slice(1, -1)}>`
    out.push(body)
  }
  return out.join('\n')
}

export interface LyricTrackMeta {
  songName?: string
  artist?: string
  album?: string
  songId?: string
  trackKey?: string
}

export interface BuildLyricInfoOptions {
  lyric: string
  translation?: string
  /** 歌曲自身的逐字歌词（lxlyric），优先于 lyric 内的标签 */
  wordLyric?: string
  /** 没有逐字歌词时，是否按行时间均匀生成 */
  autoWordLyric?: boolean
  meta?: LyricTrackMeta
  generation?: number
}

/**
 * 生成符合 OPlus lyricInfo 契约的 JSON 字符串；歌词不可用时返回 null
 */
export const buildLyricInfoJson = (options: BuildLyricInfoOptions): string | null => {
  const lyric = normalizeTimedLrc(options.lyric)
  if (!lyric || !timedLrcRxp.test(lyric)) return null

  const meta = options.meta ?? {}
  const translationLyric = normalizeTimedLrc(options.translation ?? '')

  let rawLyric = buildRawWordLyric(options.lyric, options.wordLyric)
  if (!rawLyric && options.autoWordLyric) rawLyric = buildRawWordLyric(buildAutoWordLyric(options.lyric))

  const payload: Record<string, unknown> = {
    songName: meta.songName ?? '',
    artist: meta.artist ?? '',
    album: meta.album ?? '',
    songId: meta.songId ?? '',
    lyricType: 0,
    lyric,
    rawLyric,
    translationLyric,
    provider: PROVIDER_PACKAGE,
    source: 'lx-music-mobile',
    trackKey: meta.trackKey ?? '',
    sessionGeneration: options.generation ?? 0,
    noLyric: false,
  }

  let json = JSON.stringify(payload)
  // 超长时先丢逐字，再丢翻译，保证逐行歌词一定能进系统
  if (json.length > MAX_PAYLOAD_BYTES && rawLyric) {
    payload.rawLyric = ''
    json = JSON.stringify(payload)
  }
  if (json.length > MAX_PAYLOAD_BYTES && translationLyric) {
    payload.translationLyric = ''
    json = JSON.stringify(payload)
  }
  // 仍然超限：按行折半截断，宁可少显示几句也不能让 Binder 事务炸掉
  if (json.length > MAX_PAYLOAD_BYTES) {
    const lines = lyric.split('\n')
    let kept = lines.length
    while (kept > 1) {
      kept = Math.floor(kept / 2)
      payload.lyric = lines.slice(0, kept).join('\n')
      json = JSON.stringify(payload)
      if (json.length <= MAX_PAYLOAD_BYTES) break
    }
  }
  return json.length > MAX_PAYLOAD_BYTES ? null : json
}

/** 无歌词时的空 payload（系统会隐藏歌词区域） */
export const buildEmptyLyricInfoJson = (meta?: LyricTrackMeta, generation?: number) => {
  return JSON.stringify({
    songName: meta?.songName ?? '',
    artist: meta?.artist ?? '',
    songId: meta?.songId ?? '',
    lyricType: 0,
    lyric: '',
    noLyric: true,
    provider: PROVIDER_PACKAGE,
    trackKey: meta?.trackKey ?? '',
    sessionGeneration: generation ?? 0,
  })
}
