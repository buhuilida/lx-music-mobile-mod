import { memo, useState, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

import Section from '../components/Section'
import SubTitle from '../components/SubTitle'
import Button from '../components/Button'
import { sizeFormate } from '@/utils'

import { useI18n } from '@/lang'
import { useVersionDownloadProgressUpdated, useVersionInfo } from '@/store/version/hook'
import Text from '@/components/common/Text'
import { checkUpdate, showModal } from '@/core/version'
import { toast } from '@/utils/tools'

const currentVer = process.versions.app
export default memo(() => {
  const t = useI18n()
  const versionInfo = useVersionInfo()
  // const versionStatus = useVrsionUpdateStatus()
  const [title, setTitle] = useState('')
  const [tip, setTip] = useState('')
  const [checking, setChecking] = useState(false)
  const progress = useVersionDownloadProgressUpdated()
  const handleOpenVersionModal = () => {
    // setVersionInfo({ showModal: true })
    showModal()
  }

  // 手动检查更新（1.22.16）：发现新版本会自动弹出版本弹窗，用户在弹窗里点「立即更新」完成主动升级
  const handleCheckUpdate = async() => {
    if (checking) return
    setChecking(true)
    try {
      const result = await checkUpdate()
      if (result.isLatest) toast(t('version_check_latest'), 'short')
      else if (result.isUnknown) toast(t('version_tip_failed'), 'short')
    } catch {
      toast(t('version_tip_failed'), 'short')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (versionInfo.isLatest) {
      setTitle(t('version_tip_latest'))
      setTip('')
    } else if (versionInfo.isUnknown) {
      setTitle(t('version_title_unknown'))
      setTip(t('version_tip_unknown'))
    } else {
      switch (versionInfo.status) {
        case 'downloading':
          setTitle(t('version_title_new'))
          setTip(t('version_btn_downloading', {
            total: sizeFormate(progress.total),
            current: sizeFormate(progress.current),
            progress: progress.total ? (progress.current / progress.total * 100).toFixed(2) : '0',
          }))
          break
        case 'downloaded':
          setTitle(t('version_title_update'))
          setTip('')
          break
        case 'checking':
          setTitle(t('version_title_checking'))
          setTip('')
          break
        case 'error':
          setTitle(t('version_title_failed'))
          setTip(t('version_tip_failed'))
          break
        // case 'idle':
        //   break
        default:
          setTitle(t('version_title_new'))
          setTip('')
          break
      }
    }
  }, [t, versionInfo, progress])

  return (
    <Section title={t('setting_version')}>
      <SubTitle title={title}>
        <View style={styles.desc}>
          <Text size={14}>{t('version_label_latest_ver')}{versionInfo.newVersion?.version}</Text>
          <Text size={14}>{t('version_label_current_ver')}{currentVer}</Text>
          {
            tip ? <Text size={14}>{tip}</Text> : null
          }
        </View>
        <View style={styles.btn}>
          <Button onPress={handleCheckUpdate} disabled={checking}>{checking ? t('version_title_checking') : t('version_check_update')}</Button>
          <Button onPress={handleOpenVersionModal}>{t('setting_version_show_ver_modal')}</Button>
        </View>
      </SubTitle>
    </Section>
  )
})

const styles = StyleSheet.create({
  desc: {
    marginBottom: 8,
  },
  btn: {
    flexDirection: 'row',
  },
})
