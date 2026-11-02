import { memo, useCallback } from 'react'
import { TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import { clearDownloadDirCache, resolveDownloadDirectory } from '@/core/download'
import { pickDownloadDirectory } from '@/core/download/directoryPicker'

/**
 * 下载目录设置（1.19.0）
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const savePath = useSettingValue('download.savePath')

  const handleSelect = useCallback(() => {
    void pickDownloadDirectory(savePath || undefined).then((path) => {
      if (!path) return
      updateSetting({ 'download.savePath': path })
      clearDownloadDirCache()
      toast(t('setting_download_path_saved'))
    })
  }, [savePath, t])

  const handleReset = useCallback(() => {
    updateSetting({ 'download.savePath': '' })
    clearDownloadDirCache()
    void resolveDownloadDirectory().then((path) => {
      toast(t('setting_download_path_reset_done', { path }))
    }).catch(() => {})
  }, [t])

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']}>{t('setting_download_path')}</Text>
      <Text size={11} color={theme['c-font-label']} style={styles.path} numberOfLines={2}>
        {savePath || t('setting_download_path_auto')}
      </Text>
      <View style={styles.btns}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme['c-button-background'] }]}
          onPress={handleSelect}
          activeOpacity={0.7}
        >
          <Text size={12} color={theme['c-button-font']}>{t('setting_download_path_select')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme['c-button-background'] }]}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Text size={12} color={theme['c-button-font']}>{t('setting_download_path_reset')}</Text>
        </TouchableOpacity>
      </View>
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_download_path_tip')}</Text>
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
  path: {
    marginTop: 6,
    lineHeight: 16,
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
