import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Dimensions, DrawerLayoutAndroid, type DrawerLayoutAndroidProps, View, type LayoutChangeEvent } from 'react-native'
import { Navigation } from 'react-native-navigation'
// import { getWindowSise } from '@/utils/tools'
import { usePageVisible } from '@/store/common/hook'
import { type COMPONENT_IDS } from '@/config/constant'
import { HOME_SCREEN } from '@/navigation/screenNames'

interface Props extends DrawerLayoutAndroidProps {
  visibleNavNames: COMPONENT_IDS[]
  widthPercentage: number
  widthPercentageMax?: number
}

export interface DrawerLayoutFixedType {
  openDrawer: () => void
  closeDrawer: () => void
  fixWidth: () => void
}

const getWindowWidth = () => Dimensions.get('window').width

/**
 * 修复 DrawerLayoutAndroid 在「导航到其他屏幕再返回」后无法展开的问题。
 *
 * 原生 DrawerLayout 在宿主视图被其他屏幕覆盖/恢复后，内部记录的抽屉宽度与
 * 位移可能失效：此时调用 openDrawer() 只会画出一层遮罩，抽屉本身停在屏幕外，
 * 表现为「整页变暗、点哪里都没反应」。
 *
 * 原实现只在 componentIds 变化时（即注册过 componentId 的屏幕进出时）重新布局，
 * 一起听、下载这类新屏幕没有注册 componentId，导致返回首页后永远不触发修复。
 * 这里改为监听首页自身的 appear 事件，保证任何返回路径都会在下一次打开抽屉前
 * 强制重新布局一次。
 */
const DrawerLayoutFixed = forwardRef<DrawerLayoutFixedType, Props>(({ visibleNavNames, widthPercentage, widthPercentageMax, children, ...props }, ref) => {
  const drawerLayoutRef = useRef<DrawerLayoutAndroid>(null)
  const [w, setW] = useState<number | `${number}%`>('100%')
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const width = getWindowWidth()
    const wp = Math.floor(width * widthPercentage)
    return widthPercentageMax ? Math.min(wp, widthPercentageMax) : wp
  })
  const changedRef = useRef({ width: 0, changed: false })
  // 返回首页后需要重新布局一次，否则抽屉可能只显示遮罩
  const needFixRef = useRef(false)

  const fixDrawerWidth = useCallback(() => {
    const width = changedRef.current.width || getWindowWidth()
    if (!width) return
    changedRef.current.changed = true
    // console.log('usePageVisible', visible, changedRef.current.width)
    setW(width - 1)
  }, [])

  // 修复 DrawerLayoutAndroid 在导航到其他屏幕再返回后无法打开的问题
  usePageVisible(visibleNavNames, useCallback((visible) => {
    if (!visible) return
    needFixRef.current = true
  }, []))

  useEffect(() => {
    // 任何屏幕回到首页都标记一次，下一次打开抽屉前重新布局
    const appearListener = Navigation.events().registerComponentDidAppearListener(({ componentName }) => {
      if (componentName != HOME_SCREEN) return
      needFixRef.current = true
    })
    // 首页被其他屏幕覆盖时收起抽屉，避免遗留遮罩挡住返回后的界面
    const disappearListener = Navigation.events().registerComponentDidDisappearListener(({ componentName }) => {
      if (componentName != HOME_SCREEN) return
      drawerLayoutRef.current?.closeDrawer()
    })
    return () => {
      appearListener.remove()
      disappearListener.remove()
    }
  }, [])

  const openDrawer = useCallback(() => {
    if (needFixRef.current) {
      needFixRef.current = false
      // 先让容器重新布局（等两帧，确保原生层的宽度已经提交），再打开抽屉，
      // 否则抽屉可能停在屏幕外，只留下遮罩
      fixDrawerWidth()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawerLayoutRef.current?.openDrawer()
        })
      })
      return
    }
    drawerLayoutRef.current?.openDrawer()
  }, [fixDrawerWidth])

  useImperativeHandle(ref, () => ({
    openDrawer,
    closeDrawer() {
      drawerLayoutRef.current?.closeDrawer()
    },
    fixWidth() {
      fixDrawerWidth()
    },
  }), [fixDrawerWidth, openDrawer])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    // console.log('handleLayout', e.nativeEvent.layout.width, changedRef.current.width)
    const width = e.nativeEvent.layout.width
    if (changedRef.current.changed) {
      changedRef.current.changed = false
      setW('100%')
      // 重新布局的同时同步抽屉宽度，避免宽度停留在 0 导致抽屉不可见
      const wp = Math.floor(width * widthPercentage)
      const next = widthPercentageMax ? Math.min(wp, widthPercentageMax) : wp
      if (next > 0 && next != drawerWidth) setDrawerWidth(next)
      return
    }
    if (changedRef.current.width == width) return
    changedRef.current.width = width

    // 重新设置面板宽度
    const wp = Math.floor(width * widthPercentage)
    // console.log(wp, widthPercentageMax)
    setDrawerWidth(widthPercentageMax ? Math.min(wp, widthPercentageMax) : wp)

    // 强制触发渲染以应用更改
    changedRef.current.changed = true
    setW(width - 1)
  }, [drawerWidth, widthPercentage, widthPercentageMax])

  const renderNavigationView = props.renderNavigationView

  return (
    <View
      onLayout={handleLayout}
      style={{ width: w, flex: 1 }}
    >
      <DrawerLayoutAndroid
        ref={drawerLayoutRef}
        keyboardDismissMode="on-drag"
        {...props}
        drawerWidth={drawerWidth}
        renderNavigationView={renderNavigationView}
      >
        <View style={{ marginRight: w == '100%' ? 0 : -1, flex: 1 }}>
          {children}
        </View>
      </DrawerLayoutAndroid>
    </View>
  )
})

// const styles = createStyle({
//   container: {
//     flex: 1,
//   },
// })

export default DrawerLayoutFixed
