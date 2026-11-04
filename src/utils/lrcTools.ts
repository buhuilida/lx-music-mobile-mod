const timeFieldExp = /^(?:\[[\d:.]+\])+/g
const timeExp = /\d{1,3}(:\d{1,3}){0,2}(?:\.\d{1,3})/g
/** 与 timeFieldExp 等价但不带 g，避免 lastIndex 状态在多次 exec 之间互相污染 */
const lineTimeLabelExp = /^(?:\[[\d:.]+\])+/

/**
 * 部分音源（QQ / TME 最常见）用 `//` 表示「这一行没有翻译 / 没有音译」。
 *
 * 这不是歌词内容，是占位符：直接渲染出来的效果就是每行歌词下面多出一行
 * `//`，看着像乱码。日文、英文歌尤其明显，因为大部分行本来就没有翻译。
 */
export const isLyricPlaceholder = (text: string) => {
  const value = text.trim()
  // 允许全角斜杠（部分音源转换后会变成 ／）
  return value.length > 0 && value.length <= 4 && /^[/／]+$/.test(value)
}

/**
 * 去掉「整行只有占位符」的歌词行，其余行原样保留（含时间标签）。
 *
 * 主歌词、翻译、音译三条文本都要过一遍：占位符既可能出现在翻译里，
 * 也可能出现在主歌词里（有的音源把 `//` 当成段落分隔）。
 */
export const stripLyricPlaceholderLines = (lrc: string | null | undefined) => {
  if (!lrc) return lrc ?? ''
  const lines = lrc.split(/\r\n|\n|\r/)
  const kept: string[] = []
  for (const line of lines) {
    const text = line.replace(lineTimeLabelExp, '').trim()
    if (text && isLyricPlaceholder(text)) continue
    kept.push(line)
  }
  return kept.join('\n')
}

const t_rxp_1 = /^0+(\d+)/
const t_rxp_2 = /:0+(\d+)/g
const t_rxp_3 = /\.0+(\d+)/
const formatTimeLabel = (label: string) => {
  return label.replace(t_rxp_1, '$1')
    .replace(t_rxp_2, ':$1')
    .replace(t_rxp_3, '.$1')
}

const filterExtendedLyricLabel = (lrcTimeLabels: Set<string>, extendedLyric: string) => {
  const extendedLines = extendedLyric.split(/\r\n|\n|\r/)
  const lines: string[] = []
  for (let i = 0; i < extendedLines.length; i++) {
    let line = extendedLines[i].trim()
    // 注意：这里必须用不带 g 的版本。timeFieldExp 带 g，exec 会留下 lastIndex，
    // 下一行从 lastIndex 开始匹配、又被 ^ 锚死，结果每隔一行就返回 null
    const result = lineTimeLabelExp.exec(line)
    if (!result) continue

    const timeField = result[0]
    const text = line.replace(timeFieldExp, '').trim()
    if (!text) continue
    // 与播放时保持一致：`//` 这类占位符不写进下载的歌词文件
    if (isLyricPlaceholder(text)) continue
    let times = timeField.match(timeExp)
    if (times == null) continue

    const newTimes = times.filter(time => {
      const timeStr = formatTimeLabel(time)
      return lrcTimeLabels.has(timeStr)
    })
    if (newTimes.length != times.length) {
      if (!newTimes.length) continue
      line = `[${newTimes.join('][')}]${text}`
    }
    lines.push(line)
  }

  return lines.join('\n')
}

const parseLrcTimeLabel = (lrc: string) => {
  const lines = lrc.split(/\r\n|\n|\r/)
  const linesSet = new Set<string>()
  const length = lines.length
  for (let i = 0; i < length; i++) {
    const line = lines[i].trim()
    const result = lineTimeLabelExp.exec(line)
    if (result) {
      const timeField = result[0]
      const text = line.replace(timeFieldExp, '').trim()
      if (text) {
        const times = timeField.match(timeExp)
        if (times == null) continue
        for (let time of times) {
          linesSet.add(formatTimeLabel(time))
        }
      }
    }
  }

  return linesSet
}

const buildAwlyric = (lrcData: LX.Music.LyricInfo) => {
  let lrc: string[] = []
  if (lrcData.lyric) {
    lrc.push(`lrc:${Buffer.from(lrcData.lyric.trim(), 'utf-8').toString('base64')}`)
  }
  if (lrcData.tlyric) {
    lrc.push(`tlrc:${Buffer.from(lrcData.tlyric.trim(), 'utf-8').toString('base64')}`)
  }
  if (lrcData.rlyric) {
    lrc.push(`rlrc:${Buffer.from(lrcData.rlyric.trim(), 'utf-8').toString('base64')}`)
  }
  if (lrcData.lxlyric) {
    lrc.push(`awlrc:${Buffer.from(lrcData.lxlyric.trim(), 'utf-8').toString('base64')}`)
  }
  return lrc.length ? `[awlrc:${lrc.join(',')}]` : ''
}

export const buildLyrics = (lrcData: LX.Music.LyricInfo, downloadAwlrc: boolean, downloadTlrc: boolean, downloadRlrc: boolean) => {
  // 主歌词里可能夹着 `//` 占位行，写进歌词文件同样会露出来
  const baseLyric = stripLyricPlaceholderLines(lrcData.lyric)
  if (!lrcData.tlyric && !lrcData.rlyric && !lrcData.lxlyric) return baseLyric

  const lrcTimeLabels = parseLrcTimeLabel(baseLyric)

  let lrc = baseLyric
  if (downloadTlrc && lrcData.tlyric) {
    lrc = lrc.trim() + `\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.tlyric)}\n`
  }
  if (downloadRlrc && lrcData.rlyric) {
    lrc = lrc.trim() + `\n\n${filterExtendedLyricLabel(lrcTimeLabels, lrcData.rlyric)}\n`
  }
  if (downloadAwlrc) {
    const awlrc = buildAwlyric(lrcData)
    if (awlrc) lrc = lrc.trim() + `\n\n${awlrc}\n`
  }
  return lrc
}
