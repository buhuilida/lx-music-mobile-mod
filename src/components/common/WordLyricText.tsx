import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Text as RNText, View } from 'react-native'
import { createStyle } from '@/utils/tools'
import type { WordLyricLine } from '@/utils/wordLyric'
import { useProgress, useIsPlay } from '@/store/player/hook'

interface Props {
  wordLine: WordLyricLine
  size: number
  lineHeight: number
  textAlign: 'left' | 'center' | 'right'
  activeColor: string
  inactiveColor: string
}

/**
 * 逐字歌词渲染（1.16.0）：卡拉OK式逐字高亮。
 * 播放时钟 = 最近一次 progress 事件 + 本地插值（rAF），暂停/seek 自动重置基准。
 */
export default memo(({ wordLine, size, lineHeight, textAlign, activeColor, inactiveColor }: Props) => {
  const { nowPlayTime } = useProgress()
  const isPlay = useIsPlay()
  const [activeIndex, setActiveIndex] = useState(-1)
  const charProgress = useRef(new Animated.Value(0)).current
  const baseRef = useRef({ time: 0, at: 0, playing: false })
  const rafRef = useRef<number | null>(null)
  const indexRef = useRef(-1)

  // progress 事件 / 播放状态变化 → 重置时钟基准
  useEffect(() => {
    baseRef.current = { time: nowPlayTime * 1000, at: Date.now(), playing: isPlay }
  }, [nowPlayTime, isPlay])

  useEffect(() => {
    const tick = () => {
      const base = baseRef.current
      const elapsed = base.playing ? base.time + (Date.now() - base.at) : base.time
      // 计算当前字：最后一个 time <= elapsed 的字
      let index = -1
      for (let i = 0; i < wordLine.words.length; i++) {
        if (wordLine.words[i].time <= elapsed) index = i
        else break
      }
      if (index != indexRef.current) {
        indexRef.current = index
        setActiveIndex(index)
      }
      if (index >= 0 && index < wordLine.words.length) {
        const word = wordLine.words[index]
        const p = Math.min(1, Math.max(0, (elapsed - word.time) / Math.max(1, word.duration)))
        charProgress.setValue(p)
      } else {
        charProgress.setValue(index < 0 ? 0 : 1)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [wordLine, charProgress])

  const chars = useMemo(() => wordLine.words.map(w => ({ text: w.text, time: w.time })), [wordLine])

  return (
    <View style={{ ...styles.line, justifyContent: textAlign == 'center' ? 'center' : textAlign == 'right' ? 'flex-end' : 'flex-start' }}>
      {
        chars.map((char, i) => {
          const done = i < activeIndex
          const active = i == activeIndex
          return (
            <RNText
              key={`${i}_${char.time}`}
              style={{
                ...styles.char,
                fontSize: size,
                lineHeight,
                color: done ? activeColor : inactiveColor,
              }}
            >
              {
                active
                  ? (
                    <Animated.Text
                      style={{
                        color: activeColor,
                        opacity: charProgress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                      }}
                    >{char.text}</Animated.Text>
                    )
                  : char.text
              }
            </RNText>
          )
        })
      }
    </View>
  )
}, (prev, next) => prev.wordLine === next.wordLine && prev.size == next.size && prev.activeColor == next.activeColor)

const styles = createStyle({
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  char: {
    // color 由渲染时指定
  },
})
