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

const QUALITY_LABELS: Record<string, string> = {
  '128k': '128K',
  '192k': '192K',
  '320k': '320K',
  flac: 'FLAC',
  flac24bit: 'Hi-Res',
  master: 'Master',
  ape: 'APE',
  wav: 'WAV',
  local: '本地',
}

/** 当前实际播放音质/音源徽标（1.15.0，移植自 LX-X） */
const QualityBadge = memo(() => {
  const theme = useTheme()
  const { quality, source } = usePlayingInfo()
  if (!quality) return null
  const label = QUALITY_LABELS[quality] ?? quality.toUpperCase()
  const text = source == 'download' || quality == 'local' ? label : `${label} · ${source.toUpperCase()}`

  return (
    <View style={[styles.badge, { borderColor: theme['c-500'] }]}>
      <Text size={10} color={theme['c-500']}>{text}</Text>
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
