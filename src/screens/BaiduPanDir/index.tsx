import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Browser from '@/components/baiduPan/Browser'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

/**
 * 「选择网盘目录」页（带返回按钮的独立页）
 * 由播放页「下载到网盘 → 从根目录选择」或设置页「选择目录 / 添加常用目录」打开
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.backBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <View style={styles.titleContent}>
            <Text numberOfLines={1} size={16}>{t('baidu_pan_dir_title')}</Text>
          </View>
        </View>
      </View>
      <Browser pickMode onFinish={() => { void pop(componentId) }} />
    </PageContent>
  )
})

const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 10,
  },
  backBtn: {
    width: HEADER_HEIGHT,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 2,
  },
})
