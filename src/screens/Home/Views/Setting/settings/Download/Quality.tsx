import { memo } from 'react'
import { View } from 'react-native'

import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'

const MODES = [
  { id: 'auto', labelKey: 'setting_download_quality_mode_auto' },
  { id: 'global', labelKey: 'setting_download_quality_mode_global' },
] as const

/** 全局音质档位：只列真正会下载的几档，冷门档位留给「自动」 */
const QUALITYS: Array<{ id: LX.Quality, label: string }> = [
  { id: '128k', label: '128K' },
  { id: '320k', label: '320K' },
  { id: 'flac', label: '无损' },
  { id: 'flac24bit', label: '24bit' },
  { id: 'hires', label: 'Hi-Res' },
]

/**
 * 下载音质（1.22.9）
 *
 * 之前下载只有一种行为——逐首选最高可用音质，用户没法固定成 128K 省空间。
 * 这里拆成「模式 + 档位」两个选择，默认仍是自动，老用户行为不变。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const mode = useSettingValue('download.qualityMode')
  const quality = useSettingValue('download.quality')

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']}>{t('setting_download_quality_mode')}</Text>
      <View style={styles.btns}>
        {MODES.map(item => {
          const active = mode == item.id
          return (
            <CommonButton
              key={item.id}
              onPress={() => { updateSetting({ 'download.qualityMode': item.id }) }}
              style={[styles.btn, { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] }]}
            >
              <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{t(item.labelKey)}</Text>
            </CommonButton>
          )
        })}
      </View>

      {mode == 'global'
        ? (
            <>
              <Text size={13} color={theme['c-600']} style={styles.subTitle}>{t('setting_download_quality_global')}</Text>
              <View style={styles.btns}>
                {QUALITYS.map(item => {
                  const active = quality == item.id
                  return (
                    <CommonButton
                      key={item.id}
                      onPress={() => { updateSetting({ 'download.quality': item.id }) }}
                      style={[styles.btn, { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] }]}
                    >
                      <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{item.label}</Text>
                    </CommonButton>
                  )
                })}
              </View>
            </>
          )
        : null}

      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_download_quality_tip')}</Text>
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
  subTitle: {
    marginTop: 12,
  },
  btns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  btn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
  tip: {
    marginTop: 8,
    lineHeight: 16,
  },
})
