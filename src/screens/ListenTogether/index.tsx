import { memo, useEffect } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'

import PageContent from '@/components/PageContent'
import { useListenTogetherRoom } from '@/store/listenTogether/hook'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import Header from './components/Header'
import JoinView from './JoinView'
import RoomView from './RoomView'

export default memo(({ componentId }: { componentId: string }) => {
  const { room } = useListenTogetherRoom()

  // 注册当前屏幕 id：首页抽屉依赖 componentIds 的变化来修复导航返回后失效的问题
  useEffect(() => {
    setComponentId(COMPONENT_IDS.listenTogether, componentId)
  }, [componentId])

  return (
    <PageContent>
      <Header componentId={componentId} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS == 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {room ? <RoomView /> : <JoinView />}
        </View>
      </KeyboardAvoidingView>
    </PageContent>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
})
