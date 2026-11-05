/**
 * Created by qianxin on 17/6/1.
 * 屏幕工具类
 * ui设计基准,iphone 6
 * width:375
 * height:667
 *
 * 这里所有值都必须「按需计算」，不能像旧实现那样在模块加载时算一次就固定：
 * pixelRatio 会被 @/utils/tools 间接引用，而 tools 又被 errorHandle 在
 * app.ts 第一行引用。也就是说本模块执行时，windowSizeTools.init() 还没跑完，
 * getSize() 返回的是初始值 { width: 0, height: 0 }。
 *
 * 旧实现因此得到 scale = 0，并让所有模块顶层常量变成 0：
 *   - Menu.tsx 的 menuItemWidth = scaleSizeW(100) → 0（菜单被压成一条竖线）
 *   - Home/Vertical/Content.tsx 的 MAX_WIDTH = scaleSizeW(300) → 0
 *   - DrawerLayoutFixed 里 drawerWidth = Math.min(wp, 0) → 0
 *
 * 抽屉宽度为 0 时，原生 DrawerLayout 打开抽屉的位移也是 0：动画瞬间结束、
 * 遮罩直接拉满，但抽屉本身看不见，表现就是「整页发暗、点哪里都没反应」。
 *
 * 现在的做法：
 *   1. 每次调用都读当前窗口尺寸，尺寸变化（转屏/分屏/改字号）自动重算；
 *   2. windowSizeTools 尚未就绪（0/NaN）时回退 Dimensions，绝不拿 0 参与计算；
 *   3. global.lx.fontSize 未初始化或为 0 时按 1 兜底，避免把尺寸乘成 0。
 */
import { Dimensions, PixelRatio } from 'react-native'
import { windowSizeTools } from './windowSizeTools'

// 高保真的宽度和高度
const designWidth = 375.0
const designHeight = 667.0

interface Metrics {
  /** 短边（dp） */
  width: number
  /** 长边（dp） */
  height: number
  pixelRatio: number
  fontScale: number
  scale: number
}

let cachedMetrics: Metrics | null = null

const isValidSize = (value: number | undefined): value is number =>
  typeof value == 'number' && Number.isFinite(value) && value > 0

/** 取当前字号倍率，未初始化时按 1 处理（旧实现会直接乘 undefined 得到 NaN） */
const getFontSizeScale = () => {
  const fontSize = global.lx?.fontSize
  return typeof fontSize == 'number' && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 1
}

/** 读窗口尺寸：优先 windowSizeTools，未就绪时回退 Dimensions，最后回退设计尺寸 */
const readWindowSize = () => {
  const size = windowSizeTools.getSize()
  let width = size?.width
  let height = size?.height

  if (!isValidSize(width) || !isValidSize(height)) {
    const window = Dimensions.get('window')
    width = window.width
    height = window.height
  }

  if (!isValidSize(width) || !isValidSize(height)) {
    // 极端情况下（启动首帧、窗口被系统回收）仍拿不到尺寸。
    // 用设计基准兜底，宁可尺寸略小，也不能算成 0 / NaN。
    width = designWidth
    height = designHeight
  }

  return { width, height }
}

const getMetrics = (): Metrics => {
  const size = readWindowSize()
  let screenW = size.width
  let screenH = size.height
  if (screenW > screenH) {
    const temp = screenW
    screenW = screenH
    screenH = temp
  }

  const pixelRatio = PixelRatio.get() || 1
  const fontScale = PixelRatio.getFontScale() || 1

  if (
    cachedMetrics &&
    cachedMetrics.width == screenW &&
    cachedMetrics.height == screenH &&
    cachedMetrics.pixelRatio == pixelRatio &&
    cachedMetrics.fontScale == fontScale
  ) {
    return cachedMetrics
  }

  const screenPxW = PixelRatio.getPixelSizeForLayoutSize(screenW)
  const screenPxH = PixelRatio.getPixelSizeForLayoutSize(screenH)
  const scaleW = screenPxW / designWidth
  const scaleH = screenPxH / designHeight
  const scale = Math.min(scaleW, scaleH, 3.1)

  cachedMetrics = {
    width: screenW,
    height: screenH,
    pixelRatio,
    fontScale,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  }
  return cachedMetrics
}

/**
 * 设置text
 * @param size px
 * @returns dp
 */
export function getTextSize(size: number) {
  const { width, height, fontScale } = getMetrics()
  const scaleWidth = width / designWidth
  const scaleHeight = height / designHeight
  const scale = Math.min(scaleWidth, scaleHeight, 1.3)
  return Math.floor(size * scale / fontScale)
}

export function setSpText(size: number) {
  return getTextSize(size) * getFontSizeScale()
}

/**
 * 设置高度
 * @param size px
 * @returns dp
 */
export function scaleSizeH(size: number) {
  const { scale, pixelRatio } = getMetrics()
  return Math.floor(size * scale / pixelRatio) * getFontSizeScale()
}

/**
 * 设置宽度
 * @param size px
 * @returns dp
 */
export function scaleSizeW(size: number) {
  const { scale, pixelRatio } = getMetrics()
  return Math.floor(size * scale / pixelRatio) * getFontSizeScale()
}

export const scaleSizeWR = (size: number) => {
  return size * 2 - scaleSizeW(size)
}

export const scaleSizeHR = (size: number) => {
  return size * 2 - scaleSizeH(size)
}

export const scaleSizeAbsHR = (size: number) => {
  const { scale, pixelRatio } = getMetrics()
  return size * 2 - Math.floor(size * scale / pixelRatio)
}
