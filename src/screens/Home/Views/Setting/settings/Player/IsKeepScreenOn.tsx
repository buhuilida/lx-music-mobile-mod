import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const keepScreenOn = useSettingValue('player.keepScreenOn')
  const setKeepScreenOn = (enabled: boolean) => {
    updateSetting({ 'player.keepScreenOn': enabled })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={keepScreenOn}
        onChange={setKeepScreenOn}
        helpDesc={t('setting_play_keep_screen_on_tip')}
        label={t('setting_play_keep_screen_on')}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
