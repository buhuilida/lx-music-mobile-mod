import { memo, type ReactNode } from 'react'
import { TouchableOpacity, View } from 'react-native'

import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { createStyle } from '@/utils/tools'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

interface Props {
  componentId: string
  title: string
  /** 标题右侧的操作区（播放全部、刷新等） */
  right?: ReactNode
  /** 标题下方的小字 */
  subtitle?: string
}

/**
 * 全屏页面通用头部（返回 + 居中标题 + 右侧操作）
 */
export default memo(({ componentId, title, right, subtitle }: Props) => {
  const statusBarHeight = useStatusbarHeight()
  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
      <StatusBar />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.headerBtn}>
          <Icon name="chevron-left" size={18} />
        </TouchableOpacity>
        <View style={styles.titleBox}>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text size={10} style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  )
})

const styles = createStyle({
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  },
  headerBtn: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
  },
  headerTitle: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 1,
  },
  right: {
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
})
