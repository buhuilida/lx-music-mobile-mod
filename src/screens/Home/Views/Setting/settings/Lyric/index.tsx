import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import IsShowLyricTranslation from '../Player/IsShowLyricTranslation'
import IsShowLyricRoma from '../Player/IsShowLyricRoma'
import IsS2T from '../Player/IsS2T'
import IsShowBluetoothLyric from '../Player/IsShowBluetoothLyric'
import IsShowBluetoothFullLyric from '../Player/IsShowBluetoothFullLyric'
import LockScreen from '../Player/LockScreen'
import DesktopIsShowLyric from '../LyricDesktop/IsShowLyric'
import DesktopIsLockLyric from '../LyricDesktop/IsLockLyric'
import DesktopIsShowToggleAnima from '../LyricDesktop/IsShowToggleAnima'
import DesktopIsSingleLine from '../LyricDesktop/IsSingleLine'
import DesktopIsShowTranslation from '../LyricDesktop/IsShowTranslation'
import DesktopTheme from '../LyricDesktop/Theme'
import DesktopTextSize from '../LyricDesktop/TextSize'
import DesktopViewWidth from '../LyricDesktop/ViewWidth'
import DesktopMaxLineNum from '../LyricDesktop/MaxLineNum'
import DesktopTextOpacity from '../LyricDesktop/TextOpacity'
import DesktopTextPositionX from '../LyricDesktop/TextPositionX'
import DesktopTextPositionY from '../LyricDesktop/TextPositionY'
import { useI18n } from '@/lang'

/**
 * 歌词：App 内歌词显示 + 桌面歌词。
 *
 * 原来「桌面歌词」单独占一个大类，而翻译 / 罗马音 / 蓝牙歌词 / 锁屏歌词散在「播放设置」里，
 * 想调歌词得在两处来回找。现在统一收到这里，页内按「App 内」「桌面」分两块。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_lyric')}>
      <SubTitle title={t('setting_lyric_group_app')}>
        <IsShowLyricRoma />
        <IsShowLyricTranslation />
        <IsS2T />
        <IsShowBluetoothLyric />
        <IsShowBluetoothFullLyric />
        <LockScreen />
      </SubTitle>
      <SubTitle title={t('setting_lyric_desktop')}>
        <DesktopIsShowLyric />
        <DesktopIsLockLyric />
        <DesktopIsShowToggleAnima />
        <DesktopIsSingleLine />
        <DesktopIsShowTranslation />
        <DesktopTheme />
        <DesktopTextSize />
        <DesktopViewWidth />
        <DesktopMaxLineNum />
        <DesktopTextOpacity />
        <DesktopTextPositionX />
        <DesktopTextPositionY />
      </SubTitle>
    </Section>
  )
})
