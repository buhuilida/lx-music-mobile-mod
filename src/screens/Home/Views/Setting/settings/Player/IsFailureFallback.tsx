import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const failureFallback = useSettingValue('player.failureFallback')
  const setFailureFallback = (enabled: boolean) => {
    updateSetting({ 'player.failureFallback': enabled })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={failureFallback}
        onChange={setFailureFallback}
        helpDesc={t('setting_play_failure_fallback_tip')}
        label={t('setting_play_failure_fallback')}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
