import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Text, View } from 'react-native'
import { createStyle } from '@/utils/tools'
import { setSpText } from '@/utils/pixelRatio'
import { useTextShadow, useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { buildWordUnits, type WordLyricLine } from '@/utils/wordLyric'
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
 * 逐字歌词渲染（卡拉 OK 式逐字推进）
 *
 * 播放时钟 = 最近一次 progress 事件 + 本地按倍速插值（rAF）。
 *
 * 1.22.25 之前的问题：
 * - 当前字用 opacity 0.3 → 1 淡入，字一切换就「啪」地亮起一块半透明红，
 *   视觉上是跳变而不是推进，所以看着生硬；
 * - 字号没走 setSpText，字体/阴影也没跟主题，切行时整行字会突然变大变小、变字体；
 * - 进度事件 1s 一次且 getPosition 有异步延迟，每次都把时钟基准硬重置，
 *   导致逐字进度反复回跳；
 * - 暂停时 rAF 仍在跑，白耗电。
 *
 * 现在：当前字颜色从「未唱色」平滑插值到「已唱色」，与前后字颜色完全衔接，
 * 整行是连续推进的；时钟改为低通纠偏，只有 seek（偏差 > 400ms）才硬跳。
 */
export default memo(({ wordLine, size, lineHeight, textAlign, activeColor, inactiveColor }: Props) => {
  const { nowPlayTime } = useProgress()
  const isPlay = useIsPlay()
  const theme = useTheme()
  const textShadow = useTextShadow()
  const playbackRate = useSettingValue('player.playbackRate')

  const units = useMemo(() => buildWordUnits(wordLine.words), [wordLine])
  const [activeIndex, setActiveIndex] = useState(-1)

  const charProgress = useRef(new Animated.Value(0)).current
  const baseRef = useRef({ time: 0, at: 0, playing: false, rate: 1 })
  const rateRef = useRef(playbackRate)
  const rafRef = useRef<number | null>(null)
  const indexRef = useRef(-1)
  const progressRef = useRef(-1)
  const unitsRef = useRef(units)
  unitsRef.current = units

  // 当前字的颜色插值：未唱色 → 已唱色。必须是颜色而非透明度，
  // 否则字一开始就带一层底色，与「还没唱」的字对不上，产生闪变。
  const charColor = useMemo(() => charProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveColor, activeColor],
    extrapolate: 'clamp',
  }), [charProgress, inactiveColor, activeColor])

  const readClock = () => {
    const base = baseRef.current
    return base.playing ? base.time + (Date.now() - base.at) * base.rate : base.time
  }

  // 每帧：定位当前字 + 推进当前字的字内进度
  const frameRef = useRef<(now: number) => void>(() => {})
  frameRef.current = (now: number) => {
    const list = unitsRef.current
    let index = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i].time <= now) index = i
      else break
    }
    if (index != indexRef.current) {
      indexRef.current = index
      setActiveIndex(index)
    }

    let p = 0
    if (index >= 0) {
      const unit = list[index]
      p = (now - unit.time) / Math.max(1, unit.duration)
      p = p < 0 ? 0 : p > 1 ? 1 : p
    }
    // 颜色精度 1/255，小于 0.004 的推进肉眼不可见，省掉一次 setNativeProps
    if (Math.abs(p - progressRef.current) > 0.004) {
      progressRef.current = p
      charProgress.setValue(p)
    }
  }

  // 进度事件 → 校准本地时钟
  useEffect(() => {
    const ts = Date.now()
    const now = nowPlayTime * 1000
    const base = baseRef.current
    const rateChanged = rateRef.current != playbackRate
    rateRef.current = playbackRate

    if (rateChanged) {
      baseRef.current = { time: now, at: ts, playing: isPlay, rate: playbackRate }
    } else if (!isPlay) {
      // 刚按下暂停时不能直接用 nowPlayTime：进度事件 1s 一次，暂停瞬间它最多落后 1 秒，
      // 直接对齐会让逐字往回跳一下。这里沿用本地预测值，暂停后再 seek 才用新位置。
      const cur = base.playing ? base.time + (ts - base.at) * base.rate : now
      baseRef.current = { time: cur, at: ts, playing: false, rate: playbackRate }
    } else if (!base.playing) {
      // 从暂停恢复
      baseRef.current = { time: now, at: ts, playing: true, rate: playbackRate }
    } else {
      const predicted = base.time + (ts - base.at) * base.rate
      const diff = now - predicted
      if (Math.abs(diff) > 400) {
        // 拖进度 / 切歌：直接跳，别慢慢追
        baseRef.current = { time: now, at: ts, playing: true, rate: playbackRate }
      } else if (Math.abs(diff) > 50) {
        // 进度事件只有 1s 一次，且 getPosition 是异步的（读到的是几十毫秒前的位置）。
        // 硬重置会让逐字进度往回跳，这里只按 35% 权重纠偏，视觉上完全无感。
        baseRef.current = { time: predicted + diff * 0.35, at: ts, playing: true, rate: playbackRate }
      } else {
        base.rate = playbackRate
      }
    }

    indexRef.current = -1
    frameRef.current(readClock())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlayTime, isPlay, playbackRate, units])

  // 播放中才跑 rAF：暂停时逐字进度是静止的，没必要每秒烧 60 帧
  useEffect(() => {
    if (!isPlay) return
    const loop = () => {
      frameRef.current(readClock())
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlay, units])

  const fontSize = setSpText(size)
  const fontFamily = theme['c-font-family']
  const justify = textAlign == 'center' ? 'center' : textAlign == 'right' ? 'flex-end' : 'flex-start'
  const shadowStyle = textShadow
    ? {
        textShadowColor: theme['c-primary-dark-300-alpha-800'],
        textShadowOffset: { width: 0.2, height: 0.2 },
        textShadowRadius: 2,
      }
    : null

  if (!units.length) return null

  return (
    <View style={{ ...styles.line, justifyContent: justify }}>
      {
        units.map((unit, i) => {
          const active = i == activeIndex
          return (
            <Text
              key={i}
              style={{
                ...styleBase,
                ...shadowStyle,
                fontSize,
                lineHeight,
                fontFamily,
                // 已唱过的字直接给主色；当前字的颜色由 Animated 插值接管
                color: i < activeIndex ? activeColor : inactiveColor,
              }}
            >
              {
                active
                  ? (
                    <Animated.Text
                      style={{
                        fontSize,
                        lineHeight,
                        fontFamily,
                        color: charColor,
                      }}
                    >{unit.text}</Animated.Text>
                    )
                  : unit.text
              }
            </Text>
          )
        })
      }
    </View>
  )
}, (prev, next) => {
  return prev.wordLine === next.wordLine &&
    prev.size == next.size &&
    prev.lineHeight == next.lineHeight &&
    prev.textAlign == next.textAlign &&
    prev.activeColor == next.activeColor &&
    prev.inactiveColor == next.inactiveColor
})

const styleBase = {
  // 保证每个单元是独立原生文本节点，Animated 的 setNativeProps 只作用于当前字，
  // 不会像整行单 Text 那样把颜色刷到整行上
  flexGrow: 0,
  flexShrink: 0,
} as const

const styles = createStyle({
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
})
