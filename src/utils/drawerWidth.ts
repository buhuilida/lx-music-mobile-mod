/**
 * 抽屉宽度计算。
 *
 * 调用方传进来的 widthPercentageMax 可能是模块顶层用 scaleSizeW() 算出来的，
 * 而模块加载可能早于 windowSizeTools.init()，那时算出来是 0 / NaN。
 * 一旦宽度被压成 0，抽屉就完全不可见（历史版本里这会让整页只剩一层遮罩）。
 *
 * 所以这里无论入参多离谱，都要返回一个能看见、能点到遮罩关闭的宽度。
 */

/** 抽屉最小可见宽度（dp） */
export const MIN_DRAWER_WIDTH = 180
/** 右侧至少保留的可点击遮罩宽度（dp） */
const MIN_SCRIM_WIDTH = 56

/**
 * 计算抽屉宽度。
 *
 * @param containerWidth 容器实际布局宽度，未就绪时传 0
 * @param widthPercentage 抽屉占容器宽度的比例
 * @param widthPercentageMax 调用方给的上限，可能是模块顶层算出来的 0 / NaN
 * @param windowWidth 窗口宽度，容器宽度无效时兜底
 */
export const calcDrawerWidth = (
  containerWidth: number,
  widthPercentage: number,
  widthPercentageMax?: number,
  windowWidth?: number,
) => {
  const base = Number.isFinite(containerWidth) && containerWidth > 0
    ? containerWidth
    : (Number.isFinite(windowWidth) && (windowWidth as number) > 0 ? windowWidth as number : 0)
  if (base <= 0) return MIN_DRAWER_WIDTH

  const ratio = Number.isFinite(widthPercentage) && widthPercentage > 0 ? widthPercentage : 0.7
  let width = Math.floor(base * ratio)
  if (!Number.isFinite(width) || width <= 0) width = Math.floor(base * 0.7)

  // 上限只有在合理范围内才采用。模块顶层常量在 windowSizeTools 就绪前
  // 计算会得到 0 / NaN / 个位数，这种值必须丢弃，否则抽屉会被压成 0。
  if (
    typeof widthPercentageMax == 'number' &&
    Number.isFinite(widthPercentageMax) &&
    widthPercentageMax >= MIN_DRAWER_WIDTH
  ) {
    width = Math.min(width, widthPercentageMax)
  }

  // 先保证右侧留出可点击的遮罩区，再保证抽屉自身可见。
  // 窄屏 / 分屏时两个条件会冲突，此时以「不把抽屉顶出屏幕」为准。
  const upper = Math.max(Math.floor(base - MIN_SCRIM_WIDTH), 1)
  const lower = Math.min(MIN_DRAWER_WIDTH, upper)
  if (!Number.isFinite(width) || width > upper) width = upper
  if (width < lower) width = lower

  return Math.floor(width)
}

