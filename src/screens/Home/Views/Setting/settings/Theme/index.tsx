import { memo, useCallback } from 'react'
import { TouchableOpacity } from 'react-native'

// import Section from '../../components/Section'
import Theme from './Theme'
import IsAutoTheme from './IsAutoTheme'
import IsHideBgDark from './IsHideBgDark'
import IsDynamicBg from './IsDynamicBg'
import IsFontShadow from './IsFontShadow'
import CustomBgImage from './CustomBgImage'
import CustomBgAdjust from './CustomBgAdjust'
import SubTitle from '../../components/SubTitle'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import commonState from '@/store/common/state'
import { pushThemeManagerScreen } from '@/navigation'

const ThemeManagerEntry = () => {
  const t = useI18n()
  const theme = useTheme()

  const handlePress = useCallback(() => {
    const homeId = commonState.componentIds.home
    if (!homeId) return
    pushThemeManagerScreen(homeId)
  }, [])

  return (
    <SubTitle title={t('theme_manager_title')}>
      <TouchableOpacity style={styles.entry} onPress={handlePress} activeOpacity={0.6}>
        <Text size={13} style={styles.entryText} numberOfLines={1}>{t('theme_manager_entry_tip')}</Text>
        <Icon name="chevron-right" size={16} color={theme['c-350']} />
      </TouchableOpacity>
    </SubTitle>
  )
}

export default memo(() => {
  return (
    <>
      <Theme />
      <ThemeManagerEntry />
      <IsAutoTheme />
      <IsHideBgDark />
      <IsDynamicBg />
      <IsFontShadow />
      <CustomBgImage />
      <CustomBgAdjust />
    </>
  )
})

const styles = createStyle({
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 25,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  entryText: {
    flexGrow: 1,
    flexShrink: 1,
  },
})
