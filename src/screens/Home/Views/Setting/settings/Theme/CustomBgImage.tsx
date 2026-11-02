import { memo, useCallback } from 'react'
import { View } from 'react-native'

import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { updateSetting } from '@/core/common'
import { applyTheme } from '@/core/theme'
import { getTheme } from '@/theme/themes'
import { pickImage } from '@/utils/nativeExt'
import { toast, createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const customBgImage = useSettingValue('theme.customBgImage')

  const refreshTheme = useCallback(() => {
    void getTheme().then(applyTheme)
  }, [])

  const handlePick = useCallback(() => {
    void pickImage().then((path) => {
      if (!path) return
      updateSetting({ 'theme.customBgImage': path })
      refreshTheme()
      toast(t('setting_theme_custom_bg_success'))
    })
  }, [refreshTheme, t])

  const handleClear = useCallback(() => {
    updateSetting({ 'theme.customBgImage': '' })
    refreshTheme()
  }, [refreshTheme])

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']} style={styles.label}>{t('setting_theme_custom_bg')}</Text>
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>
        {customBgImage ? t('setting_theme_custom_bg_current') : t('setting_theme_custom_bg_tip')}
      </Text>
      <View style={styles.btnContent}>
        <Button onPress={handlePick}>{t('setting_theme_custom_bg_pick')}</Button>
        {customBgImage
          ? <Button onPress={handleClear}>{t('setting_theme_custom_bg_clear')}</Button>
          : null}
      </View>
    </View>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingTop: 5,
    paddingBottom: 15,
  },
  label: {
    marginBottom: 4,
  },
  tip: {
    lineHeight: 16,
    marginBottom: 8,
  },
  btnContent: {
    flexDirection: 'row',
  },
})
