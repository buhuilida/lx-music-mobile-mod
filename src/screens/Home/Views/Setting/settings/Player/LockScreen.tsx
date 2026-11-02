import { memo, useCallback, useEffect, useState } from 'react'
import { AppState, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import { refreshSystemLyric } from '@/core/player/systemLyric'
import { isNotificationsEnabled, openLockScreenSettings, requestNotificationPermission } from '@/utils/nativeModules/utils'

/**
 * 锁屏显示（1.18.0）
 *
 * 安卓原生锁屏的媒体卡片由 MediaSession + 前台服务通知提供：
 * - 通知权限 / 锁屏显示权限由系统控制，这里提供直达入口（MIUI/HyperOS 可到「锁屏显示」页）
 * - 「锁屏歌词」把当前歌词行写入 MediaSession，ColorOS 等机型还会读取完整 lyricInfo
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const systemLyric = useSettingValue('player.systemLyric')
  const [notifyEnabled, setNotifyEnabled] = useState<boolean | null>(null)

  const refreshStatus = useCallback(() => {
    void isNotificationsEnabled().then(setNotifyEnabled).catch(() => { setNotifyEnabled(null) })
  }, [])

  useEffect(() => {
    refreshStatus()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state == 'active') refreshStatus()
    })
    return () => { subscription.remove() }
  }, [refreshStatus])

  const handleOpenLockScreen = () => {
    void openLockScreenSettings().then((ok) => {
      if (!ok) toast(t('setting_player_lock_screen_denied'), 'long')
    })
  }

  const handleNotification = () => {
    if (notifyEnabled) {
      handleOpenLockScreen()
      return
    }
    void requestNotificationPermission().then((enabled) => {
      setNotifyEnabled(enabled)
    })
  }

  const handleSystemLyric = (enable: boolean) => {
    updateSetting({ 'player.systemLyric': enable })
    refreshSystemLyric()
  }

  return (
    <SubTitle title={t('setting_player_lock_screen')}>
      <View style={styles.content}>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_player_lock_screen_tip')}</Text>
        <CheckBoxItem check={systemLyric} onChange={handleSystemLyric} label={t('setting_player_lock_screen_lyric')} />
        <View style={styles.row}>
          <Button onPress={handleOpenLockScreen}>{t('setting_player_lock_screen_open')}</Button>
          <Button onPress={handleNotification}>
            {notifyEnabled ? t('setting_player_lock_screen_notify_on') : t('setting_player_lock_screen_notify_off')}
          </Button>
        </View>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingTop: 5,
    paddingBottom: 10,
  },
  tip: {
    lineHeight: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
})
