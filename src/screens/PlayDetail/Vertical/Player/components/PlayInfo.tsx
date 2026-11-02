import { memo } from 'react'
import { View } from 'react-native'

import Progress from '@/components/player/ProgressBar'
import Status from './Status'
import { useProgress } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useBufferProgress } from '@/plugins/player'
import { usePlayingInfo } from '@/store/playingInfo/hook'
import { getQualityColor, getQualityLabel, resolveDisplayQuality } from '@/config/quality'

/** 当前实际播放音质/音源徽标（1.15.0，移植自 LX-X） */
const QualityBadge = memo(() => {
  const { quality, source, requested } = usePlayingInfo()
  if (!quality) return null
  // 母带 / 空间音频在部分音源里以 FLAC 容器返回，按实际请求成功的档位显示
  const displayQuality = resolveDisplayQuality(quality, requested)
  const label = getQualityLabel(displayQuality)
  const color = getQualityColor(displayQuality)
  const text = source == 'download' || displayQuality == 'local' ? label : `${label} · ${source.toUpperCase()}`

  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}14` }]}>
      <Text size={10} color={color} style={styles.badgeText}>{text}</Text>
    </View>
  )
})

// const FONT_SIZE = 13

const PlayTimeCurrent = ({ timeStr }: { timeStr: string }) => {
  const theme = useTheme()
  // console.log(timeStr)
  return <Text color={theme['c-500']}>{timeStr}</Text>
}

const PlayTimeMax = memo(({ timeStr }: { timeStr: string }) => {
  const theme = useTheme()
  return <Text color={theme['c-500']}>{timeStr}</Text>
})

export default () => {
  const { maxPlayTimeStr, nowPlayTimeStr, progress, maxPlayTime } = useProgress()
  const buffered = useBufferProgress()

  // console.log('render playInfo')

  return (
    <>
      <View style={styles.badgeRow}><QualityBadge /></View>
      <View style={styles.progress}><Progress progress={progress} duration={maxPlayTime} buffered={buffered} /></View>
      <View style={styles.info}>
        <PlayTimeCurrent timeStr={nowPlayTimeStr} />
        <View style={styles.status} >
          <Status />
        </View>
        <PlayTimeMax timeStr={maxPlayTimeStr} />
      </View>
    </>
  )
}


const styles = createStyle({
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flex: 0,
    height: 18,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  progress: {
    flexGrow: 1,
    flexShrink: 0,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  info: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // alignItems: 'center',
    // backgroundColor: '#ccc',
  },
  status: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
})
