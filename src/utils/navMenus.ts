import { NAV_MENUS } from '@/config/constant'

/**
 * 首页可以用左右滑动切换的页面。
 *
 * 顺序不写死，直接从 NAV_MENUS 里过滤 —— 侧边栏调整顺序后，滑动顺序自动跟着变，
 * 避免出现「侧边栏里百度网盘在下载下面，滑动却排在最后」这类错位。
 */
const PAGER_ID_SET = new Set<string>([
  'nav_search',
  'nav_songlist',
  'nav_top',
  'nav_love',
  'nav_download',
  'nav_baidu_pan',
  'nav_setting',
])

/** 全部可滑动页面，顺序与侧边栏一致 */
export const PAGER_NAV_IDS: string[] = NAV_MENUS.map(menu => menu.id).filter(id => PAGER_ID_SET.has(id))

/** 设置项 common.hiddenNavIds 存的是 JSON 数组字符串 */
export const parseHiddenNavIds = (raw: string | null | undefined): string[] => {
  try {
    const value = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item == 'string') : []
  } catch {
    return []
  }
}

/** 侧边栏要显示的项（顺序不变，只剔除被关掉的） */
export const getVisibleNavMenus = (hiddenIds: string[]) => NAV_MENUS.filter(menu => !hiddenIds.includes(menu.id))

/** 参与滑动的页面；全部关掉时兜底只留搜索，否则 PagerView 会是空容器 */
export const getVisiblePagerIds = (hiddenIds: string[]): string[] => {
  const ids = PAGER_NAV_IDS.filter(id => !hiddenIds.includes(id))
  return ids.length ? ids : ['nav_search']
}
