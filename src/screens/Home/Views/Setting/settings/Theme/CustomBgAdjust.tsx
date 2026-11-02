import { memo, useCallback, useState } from 'react'
import { View } from 'react-native'

import Slider, { type SliderProps } from '../../components/Slider'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { updateSetting } from '@/core/common'
import { applyTheme } from '@/core/theme'
import { getTheme } from '@/theme/themes'

/**
 * 自定义主题背景的不透明度与模糊度调节（1.15.0，移植自 LX-X）
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const opacity = useSettingValue('theme.customBgOpacity')
  const blur = useSettingValue('theme.customBgBlur')

  const [opacityValue, setOpacityValue] = useState(opacity)
  const [blurValue, setBlurValue] = useState(blur)

  const handleOpacityComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    updateSetting({ 'theme.customBgOpacity': value })
    void getTheme().then(applyTheme)
  }, [])

  const handleBlurComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    updateSetting({ 'theme.customBgBlur': value })
  }, [])

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']}>{t('setting_theme_custom_bg_opacity')}</Text>
      <Text size={11} color={theme['c-font-label']}>{t('setting_theme_custom_bg_opacity_tip')}</Text>
      <Slider
        minimumValue={0.3}
        maximumValue={1}
        step={0.05}
        value={opacity}
        onValueChange={setOpacityValue}
        onSlidingComplete={handleOpacityComplete}
      />
      <Text style={{ color: theme['c-primary-font'] }}>{Math.round(opacityValue * 100)}%</Text>

      <Text size={13} color={theme['c-600']} style={styles.blurLabel}>{t('setting_theme_custom_bg_blur')}</Text>
      <Text size={11} color={theme['c-font-label']}>{t('setting_theme_custom_bg_blur_tip')}</Text>
      <Slider
        minimumValue={0}
        maximumValue={10}
        step={1}
        value={blur}
        onValueChange={setBlurValue}
        onSlidingComplete={handleBlurComplete}
      />
      <Text style={{ color: theme['c-primary-font'] }}>{Math.round(blurValue)}</Text>
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
  blurLabel: {
    marginTop: 10,
  },
})
