import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const saveLrcFile = useSettingValue('download.saveLrcFile')
  const setSaveLrcFile = (enabled: boolean) => {
    updateSetting({ 'download.saveLrcFile': enabled })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={saveLrcFile}
        onChange={setSaveLrcFile}
        helpDesc={t('setting_download_save_lrc_tip')}
        label={t('setting_download_save_lrc')}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
