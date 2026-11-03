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

/** 全局音质档位：固定 8 档，与优先播放音质一致（1.22.15），中文全名 */
const QUALITYS: Array<{ id: LX.Quality, label: string }> = [
  { id: '128k', label: '128K 标准' },
  { id: '320k', label: '320K 高品质' },
  { id: 'flac', label: 'FLAC 无损' },
  { id: 'flac24bit', label: '24bit 无损' },
  { id: 'hires', label: 'Hi-Res 无损' },
  { id: 'atmos', label: '臻品全景声 Atmos' },
  { id: 'atmos_plus', label: '臻品全景声 Atmos+' },
  { id: 'master', label: '臻品母带 Master' },
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
