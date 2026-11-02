import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { updateSetting } from '@/core/common'

const MIN = 1
const MAX = 5

/**
 * 并发下载数量（1.19.0）
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const concurrency = useSettingValue('download.concurrency')

  const setValue = (value: number) => {
    updateSetting({ 'download.concurrency': Math.min(MAX, Math.max(MIN, value)) })
  }

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']}>{t('setting_download_concurrency')}</Text>
      <View style={styles.row}>
        <Text size={12} color={theme['c-font-label']} style={styles.label}>{t('setting_download_concurrency_value')}</Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme['c-button-background'] }]}
          onPress={() => { setValue(concurrency - 1) }}
          disabled={concurrency <= MIN}
        >
          <Icon name="minus-box" size={14} color={concurrency <= MIN ? theme['c-350'] : theme['c-button-font']} />
        </TouchableOpacity>
        <Text size={14} style={styles.value}>{concurrency}</Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme['c-button-background'] }]}
          onPress={() => { setValue(concurrency + 1) }}
          disabled={concurrency >= MAX}
        >
          <Text size={14} color={concurrency >= MAX ? theme['c-350'] : theme['c-button-font']}>+</Text>
        </TouchableOpacity>
      </View>
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_download_concurrency_tip')}</Text>
    </View>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingTop: 5,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  label: {
    marginRight: 10,
  },
  btn: {
    width: 28,
    height: 26,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 34,
    textAlign: 'center',
  },
  tip: {
    marginTop: 8,
    lineHeight: 16,
  },
})
