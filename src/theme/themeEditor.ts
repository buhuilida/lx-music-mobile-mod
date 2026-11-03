/**
 * 主题编辑相关的纯函数（1.23.0）
 *
 * 抽出来是为了能被单独测试：颜色归一、新建主题、导入校验。
 * 不依赖 React，也不读写存储。
 */
import { createThemeColors } from './themes/utils'

/** 内置调色板，与设置页的色块保持一致 */
export const PRESET_COLORS = [
  'rgb(77, 175, 124)', 'rgb(52, 152, 219)', 'rgb(155, 89, 182)', 'rgb(231, 76, 60)',
  'rgb(241, 196, 15)', 'rgb(230, 126, 34)', 'rgb(26, 188, 156)', 'rgb(149, 165, 166)',
  'rgb(52, 73, 94)', 'rgb(192, 57, 43)', 'rgb(39, 174, 96)', 'rgb(41, 128, 185)',
]

export const PRESET_BG_LIGHT = ['rgba(255, 255, 255, 1)', 'rgba(245, 246, 248, 1)', 'rgba(250, 246, 240, 1)']
export const PRESET_BG_DARK = ['rgba(19, 19, 19, 1)', 'rgba(28, 30, 34, 1)', 'rgba(24, 26, 27, 1)']

/** 导入的主题缺字段时的兜底 */
const DEFAULT_EXT_INFO: LX.Theme['config']['extInfo'] = {
  'c-app-background': 'var(c-primary-light-600-alpha-700)',
  'c-main-background': 'rgba(255, 255, 255, 1)',
  'bg-image': '',
  'bg-image-position': 'center',
  'bg-image-size': 'cover',
  'bg-image-portrait': '',
  'bg-image-landscape': '',
  'font-family': '',
  'c-badge-primary': 'var(c-primary)',
  'c-badge-secondary': '#4baed5',
  'c-badge-tertiary': '#e7aa36',
}

/** 主题可选字体（Android 系统字体别名） */
export const THEME_FONTS: Array<{ value: string, label: string, fontFamily?: string }> = [
  { value: '', label: '默认' },
  { value: 'serif', label: '衬线', fontFamily: 'serif' },
  { value: 'monospace', label: '等宽', fontFamily: 'monospace' },
  { value: 'sans-serif-light', label: '细体', fontFamily: 'sans-serif-light' },
  { value: 'sans-serif-medium', label: '中黑', fontFamily: 'sans-serif-medium' },
  { value: 'sans-serif-condensed', label: '窄体', fontFamily: 'sans-serif-condensed' },
]

/**
 * 把 #rgb / #rrggbb / rgb() / rgba() 统一成 rgb(r, g, b)
 * 主题里的颜色都按 rgb/rgba 计算派生色，统一格式能少踩坑。
 */
export const normalizeColor = (input: string): string | null => {
  const value = (input ?? '').trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
  if (hex) {
    const raw = hex[1]
    const full = raw.length == 3 ? raw.split('').map(c => c + c).join('') : raw
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(value)
  if (rgb) return `rgb(${Math.round(+rgb[1])}, ${Math.round(+rgb[2])}, ${Math.round(+rgb[3])})`
  return null
}

/** rgb(...) → rgba(..., 1)，背景色按不透明处理 */
export const toSolidRgba = (color: string) => {
  const normalized = normalizeColor(color)
  if (!normalized) return null
  return normalized.replace('rgb', 'rgba').replace(')', ', 1)')
}

export interface ThemeDraft {
  name: string
  primary: string
  background: string
  isDark: boolean
  /** 保留已有主题的背景图 / 字体等扩展字段（编辑时不丢） */
  extInfo?: Partial<Pick<LX.Theme['config']['extInfo'], 'bg-image' | 'bg-image-portrait' | 'bg-image-landscape' | 'font-family'>>
}

/** 用主色 + 背景色 + 明暗生成一份完整主题 */
export const buildTheme = (draft: ThemeDraft, id?: string): LX.Theme => ({
  id: id ?? `custom_${Date.now()}`,
  name: draft.name,
  isDark: draft.isDark,
  isCustom: true,
  config: {
    themeColors: createThemeColors(
      draft.primary,
      draft.isDark ? 'rgb(229, 229, 229)' : 'rgb(33, 33, 33)',
      draft.isDark,
    ) as LX.Theme['config']['themeColors'],
    extInfo: {
      'c-app-background': 'var(c-primary-light-600-alpha-700)',
      'c-main-background': draft.background,
      'bg-image': '',
      'bg-image-position': 'center',
      'bg-image-size': 'cover',
      'bg-image-portrait': '',
      'bg-image-landscape': '',
      'font-family': '',
      'c-badge-primary': 'var(c-primary)',
      'c-badge-secondary': '#4baed5',
      'c-badge-tertiary': '#e7aa36',
      ...draft.extInfo,
    },
  },
})

/**
 * 校验并整理导入的 JSON
 * - 必须有 themeColors / extInfo，否则不是主题文件
 * - 默认重新生成 id，避免和已有主题互相覆盖
 */
export const parseTheme = (raw: string, options?: { keepId?: boolean }): LX.Theme => {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('INVALID_THEME')
  }
  const theme = data as Partial<LX.Theme>
  if (!theme || typeof theme != 'object') throw new Error('INVALID_THEME')
  const config = theme.config as Partial<LX.Theme['config']> | undefined
  if (!config?.themeColors || typeof config.themeColors != 'object') throw new Error('INVALID_THEME')
  if (!config?.extInfo || typeof config.extInfo != 'object') throw new Error('INVALID_THEME')
  return {
    id: options?.keepId && typeof theme.id == 'string' ? theme.id : `custom_${Date.now()}`,
    name: typeof theme.name == 'string' && theme.name.trim() ? theme.name.trim() : 'Imported theme',
    isDark: !!theme.isDark,
    isCustom: true,
    config: {
      themeColors: config.themeColors,
      extInfo: { ...DEFAULT_EXT_INFO, ...config.extInfo },
    },
  }
}
