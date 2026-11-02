/**
 * 逐字歌词解析（1.16.0 / 1.17.0 增强）
 *
 * 支持三种常见逐字格式：
 * - lxlyric（洛雪标准，1.17.0 修正）：`[00:12.34]<0,200>我<200,232>的<432,184>心`
 *   标签在字之前，`<开始相对行首的毫秒,持续毫秒>`；个别音源也会给绝对毫秒（自动识别）
 * - A2 增强 LRC：`[00:12.34]我<00:12.34>爱<00:12.56>你`（字在标签之前，绝对时间）
 * - 带时长的 A2 变体：`[00:12.34]<00:12.34,0.22>我爱`
 *
 * 另提供 hasWordTags / stripWordTags：歌词文本本身是逐字格式时，
 * 先剥离标签再交给普通 LRC 渲染器（避免把 <0,200> 当正文显示）。
 */

export interface WordLyricWord {
  text: string
  /** 开始时间 ms（绝对时间） */
  time: number
  /** 持续 ms */
  duration: number
}

export interface WordLyricLine {
  /** 行开始时间 ms */
  time: number
  text: string
  words: WordLyricWord[]
}

const TIME_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
// 洛雪逐字：<开始毫秒,持续毫秒>
const LX_WORD_TAG = /^<(\d{1,7}),(\d+(?:\.\d+)?)>/
// A2 逐字：<mm:ss.xx> 或 <mm:ss.xx,持续秒>
const A2_WORD_TAG = /^<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?(?:,(\d+(?:\.\d+)?))?>/
// 检测用（不锚定行首）
const HAS_TAG_RXP = /<\d{1,7},\d+(?:\.\d+)?>|<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?(?:,\d+(?:\.\d+)?)?>/

const tagToMs = (m: RegExpMatchArray) => {
  const min = parseInt(m[1], 10)
  const sec = parseInt(m[2], 10)
  const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0
  return min * 60_000 + sec * 1000 + frac
}

/** 检测文本是否含逐字标签 */
export const hasWordTags = (raw: string | null | undefined): boolean => {
  if (!raw) return false
  return HAS_TAG_RXP.test(raw)
}

/** 剥离逐字标签，得到普通 LRC 文本 */
export const stripWordTags = (raw: string): string => {
  return raw.replace(/<\d{1,7}(?::\d{1,2}(?:[.:]\d{1,3})?)?(?:,\d+(?:\.\d+)?)?>/g, '')
}

interface Token { text: string, start?: number, duration?: number }

const tokenizeLine = (text: string): Token[] => {
  const tokens: Token[] = []
  let pending = ''
  let rest = text
  while (rest.length) {
    const lx = LX_WORD_TAG.exec(rest)
    const a2 = lx ? null : A2_WORD_TAG.exec(rest)
    if (lx != null || a2 != null) {
      const m = (lx ?? a2)!
      if (pending) {
        tokens.push({ text: pending })
        pending = ''
      }
      if (lx) {
        // <开始,持续>：字在标签之后，两者单位都是毫秒
        tokens.push({ text: '', start: parseInt(m[1], 10), duration: Math.round(parseFloat(m[2])) })
      } else {
        // <mm:ss.xx[,dur]>：字在标签之前
        tokens.push({ text: '', start: tagToMs(m as RegExpMatchArray), duration: m[4] ? Math.round(parseFloat(m[4]) * 1000) : undefined })
      }
      rest = rest.slice(m[0].length)
    } else {
      pending += rest[0]
      rest = rest.slice(1)
    }
  }
  if (pending) tokens.push({ text: pending })
  return tokens
}

export const parseWordLyric = (raw: string | null | undefined): WordLyricLine[] => {
  if (!raw) return []
  const lines: WordLyricLine[] = []
  for (const rawLine of raw.split(/\r\n|\n|\r/)) {
    let text = rawLine.trim()
    const lineMatch = TIME_TAG.exec(text)
    if (!lineMatch) continue
    const lineTime = tagToMs(lineMatch)
    text = text.slice(lineMatch[0].length)

    const tokens = tokenizeLine(text)
    if (!tokens.length) continue

    const words: WordLyricWord[] = []
    const consumedTags = new Set<number>()
    let pendingTag: { start: number, duration?: number } | null = null
    let lastWord: WordLyricWord | null = null
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (!token.text) {
        if (consumedTags.has(i)) continue
        pendingTag = { start: token.start ?? 0, duration: token.duration }
        continue
      }
      // 文本段：优先吃掉前面的标签（洛雪格式），否则用后面最近的未消费标签（A2 格式）
      let start: number | undefined = pendingTag?.start
      let duration = pendingTag?.duration
      pendingTag = null
      if (start == null) {
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j]
          if (t.text || t.start == null || consumedTags.has(j)) continue
          start = t.start
          duration = duration ?? t.duration
          consumedTags.add(j)
          break
        }
      }
      if (start == null) {
        // 尾部无标签的文本：并入最后一个字，避免丢字
        if (lastWord) lastWord.text += token.text
        continue
      }
      // 洛雪标签的开始时间可能是相对行首的毫秒；明显小于行时间时按相对处理
      if (start < lineTime) start += lineTime
      lastWord = { text: token.text, time: start, duration: duration ?? 0 }
      words.push(lastWord)
    }

    if (!words.length) continue
    const lineText = words.map(w => w.text).join('')
    // 补全缺失的 duration：下一个字开始时间 - 当前字开始时间
    for (let i = 0; i < words.length; i++) {
      if (!words[i].duration) {
        const nextTime = i + 1 < words.length ? words[i + 1].time : lineTime + lineText.length * 200
        words[i].duration = Math.max(60, nextTime - words[i].time)
      }
    }
    lines.push({ time: lineTime, text: lineText, words })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}
