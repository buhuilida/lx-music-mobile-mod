import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'

const STYLES: Array<{ id: 'name-singer' | 'singer-name' | 'name', labelKey: string }> = [
  { id: 'name-singer', labelKey: 'setting_download_name_name_singer' },
  { id: 'singer-name', labelKey: 'setting_download_name_singer_name' },
  { id: 'name', labelKey: 'setting_download_name_name' },
]

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const style = useSettingValue('download.fileNameStyle')

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']}>{t('setting_download_file_name')}</Text>
      <View style={styles.btns}>
        {STYLES.map(item => {
          const active = style == item.id
          return (
            <CommonButton
              key={item.id}
              onPress={() => { updateSetting({ 'download.fileNameStyle': item.id }) }}
              style={[styles.btn, { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] }]}
            >
              <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{t(item.labelKey as Parameters<typeof t>[0])}</Text>
            </CommonButton>
          )
        })}
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
  btns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  btn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
})
