import { useEffect, useRef } from 'react'
// import { getWindowSise, onDimensionChange } from '@/utils/tools'
import DrawerNav from './DrawerNav'
import Header from './Header'
import Main from './Main'
import { useSettingValue } from '@/store/setting/hook'
import { COMPONENT_IDS } from '@/config/constant'
import DrawerLayoutFixed, { type DrawerLayoutFixedType } from '@/components/common/DrawerLayoutFixed'
import { scaleSizeW } from '@/utils/pixelRatio'

const Content = () => {
  const drawer = useRef<DrawerLayoutFixedType>(null)
  const drawerLayoutPosition = useSettingValue('common.drawerLayoutPosition')
  // 不能放在模块顶层：模块加载早于 windowSizeTools.init()，算出来会是 0，
  // 抽屉宽度被 Math.min 截成 0 后，打开抽屉只会看到一层遮罩。
  const maxWidth = scaleSizeW(300)

  useEffect(() => {
    const changeVisible = (visible: boolean) => {
      if (visible) {
        drawer.current?.openDrawer()
      } else {
        drawer.current?.closeDrawer()
      }
    }

    global.app_event.on('changeMenuVisible', changeVisible)

    return () => {
      global.app_event.off('changeMenuVisible', changeVisible)
    }
  }, [])

  const navigationView = () => <DrawerNav />
  // console.log('render drawer content')

  return (
    <DrawerLayoutFixed
      ref={drawer}
      widthPercentage={0.7}
      widthPercentageMax={maxWidth}
      visibleNavNames={[COMPONENT_IDS.home]}
      // drawerWidth={width}
      drawerPosition={drawerLayoutPosition}
      renderNavigationView={navigationView}
    >
      <Header />
      <Main />
      {/* <View style={styles.container}>
      </View> */}
    </DrawerLayoutFixed>
  )
}

// const styles = createStyle({
//   container: {
//     flex: 1,
//   },
// })

export default Content
