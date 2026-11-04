/**
 * 抽屉（自绘）的渲染几何。
 *
 * 这里必须保证一条不变量：
 *   只要遮罩不透明度 > 0，抽屉面板在屏幕内的可见宽度就一定 > 0。
 *
 * 之前用原生 DrawerLayout 时，遮罩由原生绘制、滑动距离取自
 * drawerView.getWidth()，两者不是同一个来源：宽度为 0 的那一帧，
 * 遮罩会拉满、抽屉宽度却是 0，于是整页发黑且点不动。
 * 自绘之后两者都从同一个 progress 推导，这条不变量在数学上成立。
 */

/** 遮罩最大不透明度，与原生 DrawerLayout 默认 scrimColor 0x99000000 一致 */
export const SCRIM_OPACITY = 0.6

export interface DrawerFrame {
  /** 归一化后的进度，0 = 完全关闭，1 = 完全打开 */
  progress: number
  /** 遮罩不透明度 */
  scrimOpacity: number
  /** 抽屉面板在屏幕内的可见宽度（dp） */
  visibleWidth: number
  /** 面板被移出屏幕的偏移量（dp） */
  offset: number
}

/**
 * @param progress 开合进度，超出 [0,1] 会被收敛
 * @param drawerWidth 抽屉宽度，异常值按 0 处理
 */
export const computeDrawerFrame = (progress: number, drawerWidth: number): DrawerFrame => {
  const raw = Number.isFinite(progress) ? progress : 0
  const p = raw < 0 ? 0 : (raw > 1 ? 1 : raw)
  const width = Number.isFinite(drawerWidth) && drawerWidth > 0 ? drawerWidth : 0

  return {
    progress: p,
    scrimOpacity: SCRIM_OPACITY * p,
    visibleWidth: width * p,
    offset: width * (1 - p),
  }
}
