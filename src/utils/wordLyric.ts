import { isLyricPlaceholder } from '@/utils/lrcTools'

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

/**
 * 按主歌词行时间，在逐字歌词里就近匹配一行。
 *
 * 主歌词（lrc）和逐字歌词（lxlyric）来自两份文本，同一音源给出的时间戳
 * 也常有几十毫秒出入。用严格相等（或 ±10ms）去查表，一旦对不上这一行就
 * 退化成普通渲染，用户看到的是「有的歌有逐字、有的歌没有」这种不稳定现象。
 *
 * @param lines 已按 time 升序的逐字行（parseWordLyric 内部已排序）
 * @param time 主歌词行时间（ms）
 * @param tolerance 允许的最大误差（ms）
 */
export const findWordLine = (lines: WordLyricLine[], time: number, tolerance = 400): WordLyricLine | undefined => {
  if (!lines.length) return
  let lo = 0
  let hi = lines.length - 1
  let prev = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time) {
      prev = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const before = prev >= 0 ? lines[prev] : null
  const after = prev + 1 < lines.length ? lines[prev + 1] : null
  let target = before
  if (after && (!target || Math.abs(after.time - time) < Math.abs(target.time - time))) target = after
  if (!target) return
  return Math.abs(target.time - time) <= tolerance ? target : undefined
}

// CJK 汉字 / 假名 / 谚文 / 全角标点 / CJK 标点：这些按字独立成单元
const CJK_RXP = /[\u2E80-\u9FFF\u3000-\u303F\u3040-\u30FF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/

/** 渲染单元：CJK 单字，或一整段连续拉丁串（保证英文单词不会被拆到两行） */
export interface WordLyricUnit {
  text: string
  time: number
  duration: number
}

/**
 * 把逐字时间轴展开成渲染单元。
 *
 * 不少音源一条标签里塞了多个字（如 `<0,800>抚平你的心灵`），如果直接按
 * words 渲染，整条标签只会在一个时间点全部变色，「逐字」名存实亡。
 * 这里按字符均分时值，让每个字都有自己的起始时间；连续的拉丁字符/数字
 * 合并成一个单元，避免 RN 的 flexWrap 把英文单词从中间断开。
 */
export const buildWordUnits = (words: WordLyricWord[]): WordLyricUnit[] => {
  const units: WordLyricUnit[] = []
  for (const word of words) {
    const chars = Array.from(word.text)
    if (!chars.length) continue

    if (chars.length == 1) {
      units.push({ text: chars[0], time: word.time, duration: word.duration })
      continue
    }

    const per = word.duration / chars.length
    let buf = ''
    let bufTime = 0
    let bufDuration = 0
    const flush = () => {
      if (!buf) return
      units.push({ text: buf, time: bufTime, duration: bufDuration })
      buf = ''
      bufDuration = 0
    }

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      const time = word.time + per * i
      if (CJK_RXP.test(ch) || ch == ' ' || ch == '\t') {
        flush()
        units.push({ text: ch, time, duration: per })
      } else {
        if (!buf) bufTime = time
        buf += ch
        bufDuration += per
      }
    }
    flush()
  }
  return units
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

    /**
     * 判断本行逐字时间戳的基准：相对行首，还是绝对时间。
     *
     * 原来是逐字判断 `if (start < lineTime) start += lineTime`，问题在于
     * 「行时长 > 行时间」的长句（比如第 2 秒开始、唱了 12 秒的一行）里，
     * 前几个字 start 小于行时间会被加成绝对时间，后面的字超过行时间又不加，
     * 同一行的时间轴直接断成两截，表现为逐字唱到一半突然跳到很后面。
     *
     * 改成整行统一判定：洛雪 `<a,b>` 的第一个字一般从 0 开始（远小于行时间），
     * A2 `<mm:ss.xx>` 的第一个字则贴着行时间。
     */
    let firstTagStart: number | null = null
    for (const token of tokens) {
      if (!token.text && token.start != null) {
        firstTagStart = token.start
        break
      }
    }
    const isAbsoluteTime = firstTagStart != null &&
      lineTime > 0 &&
      (firstTagStart >= 1000 || Math.abs(firstTagStart - lineTime) <= 300)
    const timeBase = isAbsoluteTime ? 0 : lineTime

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
      start += timeBase
      lastWord = { text: token.text, time: start, duration: duration ?? 0 }
      words.push(lastWord)
    }

    if (!words.length) continue
    const lineText = words.map(w => w.text).join('')
    // 逐字源里同样可能有 `//` 占位行：留着会被就近匹配到相邻那句上，导致整句变成斜杠
    if (isLyricPlaceholder(lineText)) continue
    // 补全缺失的 duration：下一个字开始时间 - 当前字开始时间
    for (let i = 0; i < words.length; i++) {
      // 空格不发音，给它 0 时长。以前这里按「到下一个字的间隔」补，
      // 空格被补成 60ms，一句里几个空格就能把整行的时间轴拖长 200~300ms，
      // 结果是后半句整体滞后、行尾的字来不及亮。
      if (words[i].text == ' ' || words[i].text == '\t') {
        words[i].duration = 0
        continue
      }
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

/**
 * 自动生成逐字时间轴（1.17.1）
 *
 * 部分音源只返回普通 LRC（没有逐字标签），这里按「行时间 → 下一行时间」的间隔
 * 平均分配给每个字，生成洛雪逐字格式 `[mm:ss.xx]<偏移ms,时长ms>字`，
 * 让所有平台都能有卡拉 OK 式逐字滚动。
 */
const AUTO_LINE_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/

const msToTag = (ms: number) => {
  const total = Math.max(0, Math.round(ms))
  const min = Math.floor(total / 60_000)
  const sec = Math.floor((total % 60_000) / 1000)
  const frac = total % 1000
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(frac).padStart(3, '0')}]`
}

export const buildAutoWordLyric = (lyric: string | null | undefined): string => {
  if (!lyric) return ''
  if (hasWordTags(lyric)) return ''
  const parsed: Array<{ time: number, text: string }> = []
  for (const raw of lyric.split(/\r\n|\n|\r/)) {
    const line = raw.trim()
    const m = AUTO_LINE_TAG.exec(line)
    if (!m) continue
    const text = stripWordTags(line.slice(m[0].length)).trim()
    if (!text) continue
    if (isLyricPlaceholder(text)) continue
    parsed.push({ time: tagToMs(m as RegExpMatchArray), text })
  }
  if (parsed.length < 2) return ''

  const out: string[] = []
  for (let i = 0; i < parsed.length; i++) {
    const cur = parsed[i]
    const next = parsed[i + 1]
    const chars = Array.from(cur.text)
    let lineDuration = next ? next.time - cur.time : 4000
    // 只防 0 / 负数。不要抬到 300ms：末尾那些制作信息行（「封面：xx」）行间隔
    // 只有 40~50ms，硬抬到 300ms 会让它们排到下一行之后，末字永远来不及亮。
    if (lineDuration < 1) lineDuration = 1
    // 空格不发音，不该分走一个字的时间，否则「你也不疲倦吧 累了」中间会多停 160ms
    const voiced = chars.filter(ch => ch != ' ' && ch != '\t').length || 1
    /**
     * 默认把整行时长**完整**分配给每个字，最后一个字正好唱到下一行开始。
     *
     * 这是 1.22.17 的行为，也是唯一不会「唱快了」的算法：逐字进度和行切换
     * 用的是同一根时间轴，行内永远不会出现「早就唱完、干等十几秒」。
     *
     * 只在一种情况下压上限：单字超过 600ms。那意味着这一行的间隔远大于人声长度
     * （前奏 / 间奏后的第一句，比如「编曲: DH」离下一句有 12.5 秒），
     * 按完整时长均分会变成「一个字一个字慢慢蹦十几秒」。
     * 压到 600ms/字后，唱完剩余时间整行停在「全部已唱」，符合直觉。
     *
     * 注意不要反过来按「语速 260ms/字」估算总时长 —— 短句慢歌（两个字的
     * 「慢慢」要唱 6 秒）会被压成 0.9 秒唱完，剩下 5 秒空等，
     * 用户看到的就是「歌词跑得比唱的快」。
     */
    let per = Math.round(lineDuration / voiced)
    if (per > 600) per = 600
    /**
     * 下限只防 0，不能卡 20ms 以上。
     *
     * 末尾的制作信息行（「封面：泽丽LIX」）行间隔只有 40ms，8 个字按 20ms 排要
     * 160ms，超出 4 倍 —— 行早就切走了，后面几个字永远不亮。
     * 按 5ms/字排，40ms 内正好点亮全部，和行切换严丝合缝。
     */
    if (per < 1) per = 1
    let offset = 0
    let body = ''
    for (const ch of chars) {
      const isSpace = ch == ' ' || ch == '\t'
      // 空格给 0 时长并且不推进 offset，否则它会把整行的时间轴拖长
      body += `<${offset},${isSpace ? 0 : per}>${ch}`
      if (!isSpace) offset += per
    }
    out.push(`${msToTag(cur.time)}${body}`)
  }
  return out.join('\n')
}


/** 毫秒 → `[mm:ss.mmm]` 时间标签 */
export const msToLrcTag = (ms: number) => {
  const total = Math.max(0, Math.round(ms))
  const min = Math.floor(total / 60000)
  const sec = Math.floor(total % 60000 / 1000)
  const frac = total % 1000
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(frac).padStart(3, '0')}]`
}

/**
 * 逐字歌词 → 绝对时间的增强 LRC（写标签用）
 *
 * 输入：洛雪逐字 `[00:12.34]<0,200>我` 或 A2 `[00:12.34]我<00:12.34>爱`
 * 输出：`[00:12.340]<00:12.340>我<00:12.540>的...`
 *
 * 写进音频标签统一用 A2 绝对时间：兼容面比洛雪内部相对格式大得多。
 * 没有逐字源时不伪造，只有歌词本身带逐字标签才解析。
 */
export const buildRawWordLyric = (lrc?: string | null, wordLyric?: string | null): string => {
  let source = wordLyric ?? ''
  if (!source) {
    if (!lrc || !hasWordTags(lrc)) return ''
    source = lrc
  }
  const lines = parseWordLyric(source)
  if (!lines.length) return ''
  const out: string[] = []
  for (const line of lines) {
    if (!line.words.length) continue
    let body = msToLrcTag(line.time)
    for (const word of line.words) body += `<${msToLrcTag(word.time).slice(1, -1)}>${word.text}`
    const last = line.words[line.words.length - 1]
    const endTime = Math.max(last.time + (last.duration || 0), line.time + 1)
    body += `<${msToLrcTag(endTime).slice(1, -1)}>`
    out.push(body)
  }
  return out.join('\n')
}
