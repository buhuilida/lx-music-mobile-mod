import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

import CheckBoxItem from '../../components/CheckBoxItem'
import { toggleDesktopLyricTranslation } from '@/core/desktopLyric'
import { updateSetting } from '@/core/common'

export default memo(() => {
  const t = useI18n()
  const showTranslation = useSettingValue('desktopLyric.showTranslation')
  const update = (showTranslation: boolean) => {
    updateSetting({ 'desktopLyric.showTranslation': showTranslation })
    void toggleDesktopLyricTranslation(showTranslation)
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem check={showTranslation} onChange={update} label={t('setting_lyric_desktop_translation')} />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
    marginBottom: 15,
  },
})
