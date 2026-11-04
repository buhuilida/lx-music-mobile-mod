import { memo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { confirmDialog, showImportTip, toast } from '@/utils/tools'
import ListImportExport, { type ListImportExportType } from './ListImportExport'
import { exportLocalBackup, importLocalBackup, peekLocalBackup } from '@/core/sync/localBackup'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const listImportExportRef = useRef<ListImportExportType>(null)
  const choosePathRef = useRef<ChoosePathType>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleExportLocal = async() => {
    if (busy) return
    setBusy(true)
    try {
      const result = await exportLocalBackup()
      toast(t('setting_backup_local_export_done', { path: result.path }), 'long')
    } catch (err) {
      console.log('local backup export failed', err)
      toast(t('setting_backup_local_failed'), 'long')
    } finally {
      setBusy(false)
    }
  }

  const handlePicked = async(path: string) => {
    setPickerVisible(false)
    if (busy) return
    setBusy(true)
    try {
      const info = await peekLocalBackup(path)
      const ok = await confirmDialog({
        message: t('setting_backup_local_import_confirm', {
          time: new Date(info.at || Date.now()).toLocaleString(),
          lists: info.lists,
          musics: info.musics,
          apis: info.userApis,
          themes: info.themes,
        }),
        confirmButtonText: t('setting_backup_local_import'),
      })
      if (!ok) return
      await importLocalBackup(path)
      showImportTip('allData')
      toast(t('setting_backup_local_import_done'), 'long')
    } catch (err) {
      console.log('local backup import failed', err)
      toast(t('setting_backup_local_import_failed'), 'long')
    } finally {
      setBusy(false)
    }
  }

  const handleImportLocal = () => {
    if (busy) return
    if (!pickerVisible) {
      setPickerVisible(true)
      requestAnimationFrame(() => {
        choosePathRef.current?.show({
          title: t('setting_backup_local_import'),
          filter: ['json'],
        })
      })
    } else {
      choosePathRef.current?.show({
        title: t('setting_backup_local_import'),
        filter: ['json'],
      })
    }
  }

  return (
    <>
      <SubTitle title={t('setting_backup_local')}>
        <View style={styles.list}>
          <Button onPress={handleExportLocal}>{t('setting_backup_local_export')}</Button>
          <Button onPress={handleImportLocal}>{t('setting_backup_local_import')}</Button>
        </View>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_backup_local_tip')}</Text>
      </SubTitle>
      <SubTitle title={t('setting_backup_part')}>
        <View style={styles.list}>
          <Button onPress={() => listImportExportRef.current?.import()}>{t('setting_backup_part_import_list')}</Button>
          <Button onPress={() => listImportExportRef.current?.export()}>{t('setting_backup_part_export_list')}</Button>
        </View>
      </SubTitle>
      <ListImportExport ref={listImportExportRef} />
      {pickerVisible ? <ChoosePath ref={choosePathRef} onConfirm={handlePicked} /> : null}
    </>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tip: {
    marginTop: 6,
    lineHeight: 16,
    paddingRight: 15,
  },
})
