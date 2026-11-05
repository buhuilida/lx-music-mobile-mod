import { memo } from 'react'

import Section from '../../components/Section'
import PlayHighQuality from '../Player/PlayHighQuality'
import AudioEffect from '../Player/AudioEffect'
import MaxCache from '../Player/MaxCache'
import IsEnableAudioOffload from '../Player/IsEnableAudioOffload'
import IsHandleAudioFocus from '../Player/IsHandleAudioFocus'
import IsKeepScreenOn from '../Player/IsKeepScreenOn'
import IsFailureFallback from '../Player/IsFailureFallback'
import IsSavePlayTime from '../Player/IsSavePlayTime'
import IsAutoCleanPlayedList from '../Player/IsAutoCleanPlayedList'
import SongNotify from '../Player/SongNotify'
import IsShowNotificationImage from '../Player/IsShowNotificationImage'
import { useI18n } from '@/lang'

/**
 * 播放：音质、音效、缓存、播放行为。
 * 歌词显示相关的几项已经挪到「歌词」类里，这里不再混着放。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_playback')}>
      <PlayHighQuality />
      <AudioEffect />
      <MaxCache />
      <IsEnableAudioOffload />
      <IsHandleAudioFocus />
      <IsKeepScreenOn />
      <IsFailureFallback />
      <IsSavePlayTime />
      <IsAutoCleanPlayedList />
      <SongNotify />
      <IsShowNotificationImage />
    </Section>
  )
})
