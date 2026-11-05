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
  // 上一次进度采样的「位置 + 到达时刻」，用来判断音频是不是在缓冲（位置没前进）
  const sampleRef = useRef({ pos: 0, at: 0 })
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
    if (!list.length) return

    /**
     * 行末收尾：最后一个字的时长走完，整行必须处于「全部已唱」。
     *
     * 歌词行什么时候切走由 lrc-file-parser 决定，它和这里的逐字时钟不是同一个源，
     * 切行最多可能早几十毫秒。没有这一步，最后一个字就会永远停在插值中途
     * （半亮、或者干脆还是灰的），看起来就是「每句最后一个字没唱」。
     *
     * 行尾的空格是 0 时长，不能拿它算行末 —— 否则 lineEnd 会退回到空格的位置，
     * 整行一开始就被判成「已唱完」。
     */
    let last = list[list.length - 1]
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].duration > 0) {
        last = list[i]
        break
      }
    }
    const lineEnd = last.time + Math.max(1, last.duration)
    /**
     * 时钟根本不在这一行附近：切歌瞬间 store 里的进度还是上一首的位置
     * （可能差几分钟），拿它去比，新歌第一行会被直接判成「整行已唱」，
     * 表现为切歌后第一句一上来就是全亮的高亮态，直到下一句才恢复正常。
     * 这里不推进，等下一次进度事件把时钟基准拉回来。
     */
    if (now > lineEnd + 3000 && indexRef.current < 0) return
    if (now >= lineEnd) {
      if (indexRef.current != list.length) {
        indexRef.current = list.length
        progressRef.current = -1
        setActiveIndex(list.length)
      }
      return
    }

    let index = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i].time <= now) index = i
      else break
    }
    // 逐字只前进，不倒退。
    // 进度采样（getPosition）是异步的，每次拿到的位置比本地时钟慢几十到几百毫秒，
    // 时钟一抖动 index 就会往回退一格，用户看到的是「唱过的字又灭了」。
    // 只有真的换行（units 变化）才允许重置，那由下面的 effect 负责。
    if (index > indexRef.current) {
      indexRef.current = index
      progressRef.current = -1
      setActiveIndex(index)
    }

    // 用 indexRef 而不是上面算出的 index 算进度：
    // 采样抖动导致 index 暂时回退时，拿它算 p 会把「已经唱完的那个字」的进度
    // 错误地套到当前字上，视觉上就是字突然灭一下。
    const cur = indexRef.current
    if (cur < 0 || cur >= list.length) return
    const unit = list[cur]
    let p = (now - unit.time) / Math.max(1, unit.duration)
    p = p < 0 ? 0 : p > 1 ? 1 : p
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
      /**
       * 缓冲 / 卡顿检测：看「进度采样前进了多少」和「墙钟过了多少」是否匹配。
       *
       * 音频缓冲时 getPosition 会停住不动（真实位置没前进），但这里的时间轴
       * 是拿 Date.now() 自己往前插值的 —— 缓冲 1.2 秒，时钟就白白多跑 1.2 秒，
       * 之后整首歌的逐字都比人声快 1.2 秒：字早早亮完，人声还在唱，
       * 行尾更是提前跳。这就是「歌词渲染过快」。
       *
       * 不能靠 diff < 0 判断：getPosition 天生比本地时钟旧几十~几百毫秒，
       * diff 一直是个负数常量，拿它做阈值会误纠、越纠越偏。
       * 只有「墙钟走了 1 秒、采样位置却几乎没动」才是真的缓冲。
       */
      const prev = sampleRef.current
      const dPos = now - prev.pos
      const dTs = ts - prev.at
      const stalled = prev.at > 0 && dTs > 400 && dPos < dTs * 0.7

      if (stalled) {
        // 停在原地：把时钟压到测量位置。缓冲结束后 diff 会自然变小，
        // 下一拍按 diff > 30 / > 400 的规则跟上去，不会累积偏移。
        baseRef.current = { time: now, at: ts, playing: true, rate: playbackRate }
      } else if (diff > 400) {
        // 目标位置明显更靠前（拖进度条往后 / 缓冲结束后追上）：直接对齐
        baseRef.current = { time: now, at: ts, playing: true, rate: playbackRate }
      } else if (diff > 30) {
        // 目标略靠前：按一半权重追上，1~2 次事件内收敛，肉眼看不到跳变
        baseRef.current = { time: predicted + diff * 0.5, at: ts, playing: true, rate: playbackRate }
      } else if (diff < -1500) {
        // 明显超前（不是采样延迟能解释的量）：切歌残留 / 长时间卡顿后的残差
        baseRef.current = { time: now, at: ts, playing: true, rate: playbackRate }
      }
      // -1500 <= diff <= 30 且没在缓冲：采样位置比本地时钟靠后，
      // 这是 getPosition 的异步延迟造成的「样本旧」，不是「播放位置真的退了」。
      // 老实现这里按 35% 权重往回拉，每秒拉一次，逐字整体越唱越慢，
      // 到行尾还剩半句没亮就被下一行切走 —— 也就是「歌词只渲染一半就跳」。

      if (dTs > 0) sampleRef.current = { pos: now, at: ts }
    }

    frameRef.current(readClock())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlayTime, isPlay, playbackRate, units])

  // 换行 / 切歌：渲染单元变了，逐字进度必须从头开始
  useEffect(() => {
    indexRef.current = -1
    progressRef.current = -1
    setActiveIndex(-1)
    // 切歌瞬间 nowPlayTime 还是上一首的位置，先别急着重算，
    // 等进度事件把时钟基准拉到新歌再推进（否则第一行会被误判成已唱完）
    const t = nowPlayTime * 1000
    const lineStart = units.length ? units[0].time : 0
    if (Math.abs(t - lineStart) > 5000) return
    frameRef.current(readClock())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units])

  // 播放中才跑 rAF：暂停时逐字进度是静止的，没必要每秒烧 60 帧
  useEffect(() => {
    if (!isPlay) return
    let lastAt = 0
    const loop = () => {
      const now = Date.now()
      /**
       * 限到 ~60fps。
       *
       * 高刷屏（90/120Hz）下 rAF 每秒回调 90~120 次，而颜色精度只有 1/255，
       * 多出来的帧不会让画面更细腻，只会把 setValue 堆到 bridge 上。
       * JS 线程被这些无用的 setValue 占满后，nowPlayTime 的进度回调会被延后，
       * 本地时钟基准越来越旧 —— 逐字越唱越慢，到行尾还没亮完就被下一行切走。
       *
       * 这也是「一开录屏就正常」的原因：录屏会强制把刷新率锁到 60Hz
       * （编码器限制），rAF 频率直接减半，bridge 压力骤降，看起来就好了。
       * 换句话说，这个 bug 是「渲染频率绑架时序正确性」，不是歌词数据的问题。
       */
      if (now - lastAt >= 16) {
        lastAt = now
        frameRef.current(readClock())
      }
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
