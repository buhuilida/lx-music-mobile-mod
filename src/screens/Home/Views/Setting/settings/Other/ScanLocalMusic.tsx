import { memo, useState } from 'react'
import { View } from 'react-native'

import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { scanAndSyncLocalList } from '@/core/localMusic'

/**
 * 本地音乐扫描入口（1.16.0，参照 LX-X 本地音乐）
 * 扫描 Music / Download 目录音频文件到「本地音乐」歌单。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const [scanning, setScanning] = useState(false)

  const handleScan = () => {
    if (scanning) return
    setScanning(true)
    void scanAndSyncLocalList().then((count) => {
      toast(t('setting_local_music_done', { count }))
    }).catch((err: Error) => {
      toast(t('setting_local_music_failed', { msg: err.message ?? '' }))
    }).finally(() => {
      setScanning(false)
    })
  }

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']} style={styles.label}>{t('setting_local_music')}</Text>
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_local_music_tip')}</Text>
      <View style={styles.btnContent}>
        <Button onPress={handleScan}>{scanning ? t('setting_local_music_scanning') : t('setting_local_music_scan')}</Button>
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
  label: {
    marginBottom: 4,
  },
  tip: {
    lineHeight: 16,
    marginBottom: 8,
  },
  btnContent: {
    flexDirection: 'row',
  },
})
