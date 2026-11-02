import { memo, useState } from 'react'
import { View } from 'react-native'

import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { scanAndSyncLocalList } from '@/core/localMusic'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { friendlyError } from '@/utils/errorMsg'

/**
 * 本地音乐扫描入口（1.16.0，参照 LX-X 本地音乐）
 * 扫描 Music / Download 目录音频文件到「本地音乐」歌单。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const [scanning, setScanning] = useState(false)
  const [count, setCount] = useState(0)

  const handleScan = () => {
    if (scanning) return
    setScanning(true)
    setCount(0)
    void scanAndSyncLocalList(setCount).then((total) => {
      toast(t('setting_local_music_done', { count: total }))
      const ids = commonState.componentIds
      const componentId = ids.home ?? ids.playDetail ?? Object.values(ids)[0]
      if (componentId) navigations.pushLocalMusicScreen(componentId)
    }).catch((err: Error) => {
      toast(t('setting_local_music_failed', { msg: friendlyError(err) }), 'long')
    }).finally(() => {
      setScanning(false)
    })
  }

  return (
    <View style={styles.content}>
      <Text size={13} color={theme['c-600']} style={styles.label}>{t('setting_local_music')}</Text>
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_local_music_tip')}</Text>
      <View style={styles.btnContent}>
        <Button onPress={handleScan} disabled={scanning}>
          {scanning ? t('setting_local_music_scanning_progress', { count }) : t('setting_local_music_scan')}
        </Button>
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
