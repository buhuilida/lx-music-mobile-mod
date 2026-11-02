import { memo } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useDownloadList } from '@/store/download/hook'
import { formatSize } from '@/core/download'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const list = useDownloadList()

  const openDownload = () => {
    const ids = commonState.componentIds
    const componentId = ids.home ?? ids.playDetail ?? Object.values(ids)[0]
    if (!componentId) return
    navigations.pushDownloadScreen(componentId)
  }

  const total = list.reduce((sum, item) => sum + item.size, 0)

  return (
    <SubTitle title={t('download_title')}>
      <View style={styles.content}>
        <Text size={12} color={theme['c-font-label']} style={styles.tip}>
          {list.length ? `${list.length} 首 · ${formatSize(total)}` : t('download_empty_tip')}
        </Text>
        <Text size={11} color={theme['c-font-label']} style={styles.dir}>
          {t('download_save_dir')}
        </Text>
        <View style={styles.btnContent}>
          <Button onPress={openDownload}>{t('download_open')}</Button>
        </View>
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
  },
  dir: {
    marginBottom: 10,
  },
})
