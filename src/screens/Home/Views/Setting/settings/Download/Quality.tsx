import { memo } from 'react'
import { View } from 'react-native'

import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'

import { SELECTABLE_QUALITYS, getQualityFullLabel } from '@/config/quality'

const MODES = [
  { id: 'auto', labelKey: 'setting_download_quality_mode_auto' },
  { id: 'global', labelKey: 'setting_download_quality_mode_global' },
] as const

/** 全局音质档位：固定 8 档，与优先播放音质共用同一份列表（1.22.17） */
const QUALITYS = SELECTABLE_QUALITYS

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
              style={[styles.btn, {
                backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'],
                borderColor: active ? theme['c-primary'] : 'transparent',
              }]}
            >
              <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>
                {`${active ? '✓ ' : ''}${t(item.labelKey)}`}
              </Text>
            </CommonButton>
          )
        })}
      </View>

      {mode == 'global'
        ? (
            <>
              <Text size={13} color={theme['c-600']} style={styles.subTitle}>
                {`${t('setting_download_quality_global')}　${t('setting_download_quality_current', { quality: getQualityFullLabel(quality) })}`}
              </Text>
              <View style={styles.btns}>
                {QUALITYS.map(id => {
                  const active = quality == id
                  return (
                    <CommonButton
                      key={id}
                      onPress={() => { updateSetting({ 'download.quality': id }) }}
                      style={[styles.btn, {
                        backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'],
                        borderColor: active ? theme['c-primary'] : 'transparent',
                      }]}
                    >
                      <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>
                        {`${active ? '✓ ' : ''}${getQualityFullLabel(id)}`}
                      </Text>
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
    borderWidth: 1,
  },
  tip: {
    marginTop: 8,
    lineHeight: 16,
  },
})
