import { memo, useRef } from 'react'

import { View, StyleSheet, TouchableOpacity } from 'react-native'

import { pop, navigations } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo } from '@/store/player/hook'
import Text from '@/components/common/Text'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import commonState from '@/store/common/state'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import { useStatusbarHeight } from '@/store/common/hook'
import { useI18n } from '@/lang'
import Btn from './Btn'
import TimeoutExitBtn from './TimeoutExitBtn'
import DownloadBtn from '../../components/DownloadBtn'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)


const Title = () => {
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()


  return (
    <View style={styles.titleContent}>
      <Text numberOfLines={1} style={styles.title}>{musicInfo.name}</Text>
      <Text numberOfLines={1} style={styles.title} size={12} color={theme['c-font-label']}>{musicInfo.singer}</Text>
    </View>
  )
}

export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const t = useI18n()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }
  const showListenTogether = () => {
    const componentId = commonState.componentIds.playDetail
    if (!componentId) return
    navigations.pushListenTogetherScreen(componentId)
  }

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <TouchableOpacity onPress={showListenTogether} style={{ ...styles.listenBtn, backgroundColor: theme['c-button-background'] }}>
          <Text size={12} color={theme['c-button-font']}>{t('listen_together')}</Text>
        </TouchableOpacity>
        <DownloadBtn />
        <TimeoutExitBtn />
        <Btn icon="slider" onPress={showSetting} />
      </View>
      <SettingPopup ref={popupRef} direction="vertical" />
    </View>
  )
})


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // justifyContent: 'center',
    height: '100%',
  },
  titleContent: {
    flex: 1,
    paddingHorizontal: 5,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex: 1,
    // textAlign: 'center',
  },
  listenBtn: {
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: scaleSizeW(8),
    paddingRight: scaleSizeW(8),
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 10,
    marginRight: 4,
    alignSelf: 'center',
  },
  icon: {
    paddingLeft: 4,
    paddingRight: 4,
  },
})
