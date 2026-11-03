import { memo, useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useDownloadList } from '@/store/download/hook'
import { useSettingValue } from '@/store/setting/hook'
import { formatSize, clearDownloadDirCache, resolveDownloadDirectory } from '@/core/download'
import { pickDownloadDirectory } from '@/core/download/directoryPicker'
import { updateSetting } from '@/core/common'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { createStyle, toast } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const list = useDownloadList()
  // 当前实际使用的保存位置（含自动回退逻辑），保存路径设置变更后刷新
  const savePath = useSettingValue('download.savePath')
  const [currentDir, setCurrentDir] = useState('')

  useEffect(() => {
    let cancelled = false
    void resolveDownloadDirectory().then((path) => {
      if (!cancelled) setCurrentDir(path)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [savePath])

  const openDownload = () => {
    const ids = commonState.componentIds
    const componentId = ids.home ?? ids.playDetail ?? Object.values(ids)[0]
    if (!componentId) return
    navigations.pushDownloadScreen(componentId)
  }

  const handleChangeDir = useCallback(() => {
    void pickDownloadDirectory(savePath || undefined).then((path) => {
      if (!path) return
      updateSetting({ 'download.savePath': path })
      clearDownloadDirCache()
      toast(t('setting_download_path_saved'))
    })
  }, [savePath, t])

  const handleResetDir = useCallback(() => {
    updateSetting({ 'download.savePath': '' })
    clearDownloadDirCache()
    void resolveDownloadDirectory().then((path) => {
      toast(t('setting_download_path_reset_done', { path }))
    }).catch(() => {})
  }, [t])

  const total = list.reduce((sum, item) => sum + item.size, 0)

  return (
    <SubTitle title={t('download_title')}>
      <View style={styles.content}>
        <Text size={12} color={theme['c-font-label']} style={styles.tip}>
          {list.length ? `${list.length} 首 · ${formatSize(total)}` : t('download_empty_tip')}
        </Text>
        <Text size={11} color={theme['c-font-label']} style={styles.dir} numberOfLines={2}>
          {t('download_save_dir_dynamic', { path: currentDir || '...' })}
        </Text>
        <View style={styles.btnContent}>
          <Button onPress={openDownload}>{t('download_open')}</Button>
          <Button onPress={handleChangeDir}>{t('download_change_dir')}</Button>
          <Button onPress={handleResetDir}>{t('download_reset_dir')}</Button>
        </View>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>
          {t('setting_download_path_tip')}
        </Text>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingBottom: 15,
  },
  tip: {
    lineHeight: 16,
    marginBottom: 8,
  },
  btnContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dir: {
    marginBottom: 10,
  },
})
