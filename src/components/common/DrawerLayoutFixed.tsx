import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { calcDrawerWidth } from '@/utils/drawerWidth'
import { SCRIM_OPACITY } from '@/utils/drawerFrame'
import { type COMPONENT_IDS } from '@/config/constant'

interface Props {
  /** 兼容旧接口，自绘抽屉不再依赖页面可见性 */
  visibleNavNames?: COMPONENT_IDS[]
  widthPercentage: number
  widthPercentageMax?: number
  drawerPosition?: 'left' | 'right'
  renderNavigationView: () => ReactNode
  drawerBackgroundColor?: string
  style?: StyleProp<ViewStyle>
  children?: ReactNode
  onDrawerOpen?: () => void
  onDrawerClose?: () => void
}

export interface DrawerLayoutFixedType {
  openDrawer: () => void
  closeDrawer: () => void
  fixWidth: () => void
}

/** 开合动画时长，接近原生 DrawerLayout 的 smoothSlide */
const ANIM_DURATION = 220
/** 边缘起手区宽度 */
const EDGE_WIDTH = 20
/** 判定为横向拖动的最小位移 */
const SWIPE_THRESHOLD = 12
/** 松手时判定为打开的最小进度 */
const OPEN_THRESHOLD = 0.4
/** 松手时判定为关闭的最大进度 */
const CLOSE_THRESHOLD = 0.6

const clamp = (value: number, min: number, max: number) => value < min ? min : (value > max ? max : value)

/**
 * 抽屉容器（自绘实现）。
 *
 * 这里不再使用原生 DrawerLayoutAndroid。原生实现的滑动距离取自
 * drawerView.getWidth()，一旦宽度在某一帧是 0，openDrawer 的位移就是 0：
 * 动画瞬间结束、原生遮罩直接拉满，抽屉不出现且遮罩吃掉所有触摸，
 * 表现就是「整页发黑、点不动」。而这个宽度受容器 measure、页面
 * detach/attach、导航转场影响，JS 层无法保证它每一帧都正确。
 *
 * 自绘之后：
 * - 宽度只由窗口宽度计算，永远 > 0；
 * - 遮罩和面板共用同一个 Animated.Value，任何时刻都不可能只有遮罩没有面板；
 * - 遮罩由 JS 绘制，点击即可关闭，不存在「原生遮罩残留」。
 */
const DrawerLayoutFixed = forwardRef<DrawerLayoutFixedType, Props>(({
  widthPercentage,
  widthPercentageMax,
  drawerPosition = 'left',
  renderNavigationView,
  drawerBackgroundColor,
  style,
  children,
  onDrawerOpen,
  onDrawerClose,
}, ref) => {
  const { width: windowWidth } = useWindowDimensions()
  const drawerWidth = calcDrawerWidth(windowWidth, widthPercentage, widthPercentageMax)
  const isRight = drawerPosition === 'right'

  const progress = useRef(new Animated.Value(0)).current
  /** 遮罩是否挂载：打开时立即挂载，关闭动画结束后卸载 */
  const [scrimMounted, setScrimMounted] = useState(false)
  /** 逻辑上是否处于打开状态，用于 pointerEvents 与返回键 */
  const [opened, setOpened] = useState(false)
  const openRef = useRef(false)
  const progressRef = useRef(0)
  const drawerWidthRef = useRef(drawerWidth)
  drawerWidthRef.current = drawerWidth
  const animRef = useRef<Animated.CompositeAnimation | null>(null)
  const aliveRef = useRef(true)
  const callbacksRef = useRef({ onDrawerOpen, onDrawerClose })
  callbacksRef.current = { onDrawerOpen, onDrawerClose }

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      animRef.current?.stop()
    }
  }, [])

  const animateTo = useCallback((to: 0 | 1) => {
    animRef.current?.stop()
    const next = to === 1
    openRef.current = next
    progressRef.current = to
    if (next) setScrimMounted(true)
    setOpened(next)

    const anim = Animated.timing(progress, {
      toValue: to,
      duration: ANIM_DURATION,
      easing: next ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    })
    animRef.current = anim
    anim.start(({ finished }) => {
      if (!finished || !aliveRef.current) return
      if (next) {
        callbacksRef.current.onDrawerOpen?.()
      } else {
        setScrimMounted(false)
        callbacksRef.current.onDrawerClose?.()
      }
    })
  }, [progress])

  const openDrawer = useCallback(() => {
    if (openRef.current) return
    animateTo(1)
  }, [animateTo])

  const closeDrawer = useCallback(() => {
    if (!openRef.current && progressRef.current <= 0) return
    animateTo(0)
  }, [animateTo])

  // 抽屉打开时，返回键先收起抽屉而不是退出页面
  useEffect(() => {
    if (!opened) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer()
      return true
    })
    return () => sub.remove()
  }, [opened, closeDrawer])

  /** 关闭状态下从屏幕边缘横向拖动打开 */
  const edgeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (e, gesture) => {
      if (openRef.current) return false
      if (Math.abs(gesture.dx) < SWIPE_THRESHOLD) return false
      if (Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.5) return false
      // 用起手坐标判断，不能用当前坐标：快速滑动时第一次 move 已经离边缘很远了
      const x = gesture.x0
      const inEdge = isRight ? x > windowWidth - EDGE_WIDTH : x < EDGE_WIDTH
      if (!inEdge) return false
      return isRight ? gesture.dx < 0 : gesture.dx > 0
    },
    onPanResponderGrant: () => {
      // 用实际动画值回填，不能用目标值：动画进行中接管时两者可能差很远
      progress.stopAnimation((value) => { progressRef.current = value })
      setScrimMounted(true)
      setOpened(true)
      openRef.current = true
    },
    onPanResponderMove: (_, gesture) => {
      const base = isRight ? -gesture.dx : gesture.dx
      const value = clamp(base / drawerWidthRef.current, 0, 1)
      progressRef.current = value
      progress.setValue(value)
    },
    onPanResponderRelease: (_, gesture) => {
      const byVelocity = isRight ? gesture.vx < -0.4 : gesture.vx > 0.4
      animateTo(progressRef.current > OPEN_THRESHOLD || byVelocity ? 1 : 0)
    },
    onPanResponderTerminate: () => {
      animateTo(progressRef.current > OPEN_THRESHOLD ? 1 : 0)
    },
  }), [animateTo, isRight, progress, windowWidth])

  /** 遮罩：点击关闭，横向拖动跟手关闭 */
  const scrimResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      progress.stopAnimation((value) => { progressRef.current = value })
    },
    onPanResponderMove: (_, gesture) => {
      const base = isRight ? gesture.dx : -gesture.dx
      const value = clamp(1 - base / drawerWidthRef.current, 0, 1)
      progressRef.current = value
      progress.setValue(value)
    },
    onPanResponderRelease: (_, gesture) => {
      // 位移很小视为点击遮罩，直接关闭
      if (Math.abs(gesture.dx) < SWIPE_THRESHOLD && Math.abs(gesture.dy) < SWIPE_THRESHOLD) {
        animateTo(0)
        return
      }
      const byVelocity = isRight ? gesture.vx > 0.4 : gesture.vx < -0.4
      animateTo(progressRef.current > CLOSE_THRESHOLD && !byVelocity ? 1 : 0)
    },
    onPanResponderTerminate: () => {
      animateTo(progressRef.current > CLOSE_THRESHOLD ? 1 : 0)
    },
  }), [animateTo, isRight, progress])

  useImperativeHandle(ref, () => ({
    openDrawer,
    closeDrawer,
    // 自绘实现不需要再同步原生宽度，保留空实现兼容调用方
    fixWidth() {},
  }), [openDrawer, closeDrawer])

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [isRight ? drawerWidth : -drawerWidth, 0],
  })
  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCRIM_OPACITY],
  })

  return (
    <View style={[styles.container, style]} {...edgeResponder.panHandlers}>
      {children}
      {scrimMounted
        ? (
          <Animated.View
            style={[styles.scrim, { opacity: scrimOpacity }]}
            pointerEvents={opened ? 'auto' : 'none'}
          >
            <View
              style={styles.fill}
              {...scrimResponder.panHandlers}
            />
          </Animated.View>
          )
        : null}
      <Animated.View
        style={[
          styles.drawer,
          isRight ? styles.drawerRight : styles.drawerLeft,
          {
            width: drawerWidth,
            backgroundColor: drawerBackgroundColor,
            transform: [{ translateX }],
          },
        ]}
        pointerEvents={opened ? 'auto' : 'none'}
      >
        {renderNavigationView()}
      </Animated.View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  drawerLeft: {
    left: 0,
  },
  drawerRight: {
    right: 0,
  },
})

export default DrawerLayoutFixed
