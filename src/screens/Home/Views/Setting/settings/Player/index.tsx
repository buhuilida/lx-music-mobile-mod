import { memo } from 'react'

import Section from '../../components/Section'
import IsSavePlayTime from './IsSavePlayTime'
import PlayHighQuality from './PlayHighQuality'
import IsHandleAudioFocus from './IsHandleAudioFocus'
import IsEnableAudioOffload from './IsEnableAudioOffload'
import IsAutoCleanPlayedList from './IsAutoCleanPlayedList'
import IsFailureFallback from './IsFailureFallback'
import IsKeepScreenOn from './IsKeepScreenOn'
import AudioEffect from './AudioEffect'
import LockScreen from './LockScreen'
import SourceTest from './SourceTest'
import IsShowBluetoothLyric from './IsShowBluetoothLyric'
import IsShowBluetoothFullLyric from './IsShowBluetoothFullLyric'
import IsShowNotificationImage from './IsShowNotificationImage'
import IsShowLyricTranslation from './IsShowLyricTranslation'
import IsShowLyricRoma from './IsShowLyricRoma'
import IsS2T from './IsS2T'
import MaxCache from './MaxCache'
import SongNotify from './SongNotify'
import { useI18n } from '@/lang'


export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_player')}>
      <IsSavePlayTime />
      <IsAutoCleanPlayedList />
      <IsFailureFallback />
      <IsKeepScreenOn />
      <IsHandleAudioFocus />
      <IsEnableAudioOffload />
      <IsShowBluetoothLyric />
      <IsShowBluetoothFullLyric />
      <IsShowNotificationImage />
      <IsShowLyricTranslation />
      <IsShowLyricRoma />
      <IsS2T />
      <SongNotify />
      <MaxCache />
      <PlayHighQuality />
      <LockScreen />
      <AudioEffect />
      <SourceTest />
    </Section>
  )
})
