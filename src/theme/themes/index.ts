/* eslint-disable @typescript-eslint/no-var-requires */
import { getUserTheme, saveUserTheme } from '@/utils/data'
import themes from '@/theme/themes/themes'
import settingState from '@/store/setting/state'
import themeState from '@/store/theme/state'
import { isUrl } from '@/utils'
import { privateStorageDirectoryPath } from '@/utils/fs'
import { type ImageSourcePropType } from 'react-native'

export const BG_IMAGES = {
  'china_ink.jpg': require('./images/china_ink.jpg') as ImageSourcePropType,
  'jqbg.jpg': require('./images/jqbg.jpg') as ImageSourcePropType,
  'landingMoon.png': require('./images/landingMoon2.png') as ImageSourcePropType,
  'myzcbg.jpg': require('./images/myzcbg.jpg') as ImageSourcePropType,
  'xnkl.png': require('./images/xnkl.png') as ImageSourcePropType,
} as const


let userThemes: LX.Theme[]
export const getAllThemes = async() => {
  // eslint-disable-next-line require-atomic-updates
  userThemes ??= await getUserTheme()
  return {
    themes,
    userThemes,
    dataPath: privateStorageDirectoryPath + '/theme_images',
  }
}

export const saveTheme = async(theme: LX.Theme) => {
  // 直接进编辑页保存时，getAllThemes 可能还没被调用过，这里兜底初始化
  // eslint-disable-next-line require-atomic-updates
  userThemes ??= await getUserTheme()
  const targetTheme = userThemes.find(t => t.id === theme.id)
  if (targetTheme) Object.assign(targetTheme, theme)
  else userThemes.push(theme)
  await saveUserTheme(userThemes)
}

export const removeTheme = async(id: string) => {
  // eslint-disable-next-line require-atomic-updates
  userThemes ??= await getUserTheme()
  const index = userThemes.findIndex(t => t.id === id)
  if (index < 0) return
  userThemes.splice(index, 1)
  await saveUserTheme(userThemes)
}

export type LocalTheme = typeof themes[number]
type ColorsKey = keyof LX.Theme['config']['themeColors']
type ExtInfoKey = keyof LX.Theme['config']['extInfo']
const varColorRxp = /^var\((.+)\)$/

/**
 * 把颜色改成指定透明度
 * 主题里的主背景色多是 `rgb(...)` / `rgba(..., 1)` 这种不透明写法，
 * 直接叠在背景图上层会把图片完全挡住
 */
const withAlpha = (color: string, alpha: number) => {
  const match = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (!match) return `rgba(255, 255, 255, ${alpha})`
  const parts = match[1].split(',').map(part => part.trim())
  const [r, g, b] = parts
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const buildActiveThemeColors = (theme: LX.Theme): LX.ActiveTheme => {
  let bgImg: ImageSourcePropType | undefined
  let bgImgPortrait: ImageSourcePropType | undefined
  let bgImgLandscape: ImageSourcePropType | undefined
  // 自定义主题里的图片可能是网络地址，也可能是 theme_images 目录下的文件名
  const resolveThemeImage = (image: string | undefined): ImageSourcePropType | undefined => {
    if (!image) return undefined
    return isUrl(image) ? { uri: image } : { uri: `file://${privateStorageDirectoryPath}/theme_images/${image}` }
  }
  // 用户自定义的背景图片优先级最高
  const customBgImage = settingState.setting['theme.customBgImage']
  if (customBgImage) {
    bgImg = { uri: customBgImage.startsWith('file://') ? customBgImage : `file://${customBgImage}` }
  } else if (theme.isCustom) {
    bgImg = resolveThemeImage(theme.config.extInfo['bg-image'])
    // 竖屏 / 横屏背景图（1.22.11），未单独设置时回退到通用背景图
    bgImgPortrait = resolveThemeImage(theme.config.extInfo['bg-image-portrait']) ?? bgImg
    bgImgLandscape = resolveThemeImage(theme.config.extInfo['bg-image-landscape']) ?? bgImg
  } else {
    const extInfo = (theme as LocalTheme).config.extInfo
    if (extInfo['bg-image']) {
      if (!theme.isDark || !settingState.setting['theme.hideBgDark']) bgImg = BG_IMAGES[extInfo['bg-image']]
    }
    bgImgPortrait = bgImg
    bgImgLandscape = bgImg
  }

  theme.config.extInfo = { ...theme.config.extInfo }

  for (const [k, v] of Object.entries(theme.config.extInfo) as Array<[ExtInfoKey, LX.Theme['config']['extInfo'][ExtInfoKey]]>) {
    if (!v || !v.startsWith('var(')) continue
    theme.config.extInfo[k] = theme.config.themeColors[v.replace(varColorRxp, '$1') as ColorsKey]
  }

  const themeColors = { ...theme.config.themeColors }
  // 内置带图主题（如近墨者黑）的主背景是半透明的，图片才能透出来。
  // 自定义主题背景色是不透明纯色，所以这里必须做同样的覆写——
  // 注意竖屏 / 横屏单独设置的图片也要触发（它们不走 bgImg），否则图片会被纯色背景完全盖住
  if (bgImg || bgImgPortrait || bgImgLandscape) {
    /**
     * 有背景图时必须让主背景透出图片。
     * 注意：c-main-background 定义在 extInfo 里（var() 解析后也是），而返回对象里
     * extInfo 在 themeColors 之后展开，所以这里必须写回 extInfo，否则会被覆盖——
     * 之前「自定义背景只有内置带图主题能看到」就是这个原因。
     */
    const extColors = theme.config.extInfo as unknown as Record<string, string>
    const baseMainBackground = extColors['c-main-background'] ??
      (theme.isDark ? 'rgb(19, 19, 19)' : 'rgb(255, 255, 255)')
    // 蒙层不透明度允许用户调节（1.15.0，移植自 LX-X 的背景不透明度功能），限制在 0.3 ~ 1
    const userOpacity = Number(settingState.setting['theme.customBgOpacity'])
    const opacity = Number.isFinite(userOpacity) ? Math.min(1, Math.max(0.3, userOpacity)) : (theme.isDark ? 0.78 : 0.72)
    extColors['c-main-background'] = withAlpha(baseMainBackground, opacity)
  }

  return {
    id: theme.id,
    name: theme.name,
    isDark: theme.isDark,
    ...themeColors,
    ...theme.config.extInfo,
    'c-font': theme.config.themeColors['c-850'],
    // 有背景图时辅助文字用更深的灰，避免浅色照片下看不清
    'c-font-label': bgImg && !theme.isDark ? theme.config.themeColors['c-650'] : theme.config.themeColors['c-450'],
    'c-primary-font': theme.config.themeColors['c-primary'],
    'c-primary-font-hover': theme.config.themeColors['c-primary-alpha-300'],
    'c-primary-font-active': theme.config.themeColors['c-primary-dark-100-alpha-200'],
    'c-primary-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-primary-background-hover': theme.config.themeColors['c-primary-light-300-alpha-800'],
    'c-primary-background-active': theme.config.themeColors['c-primary-light-100-alpha-800'],
    'c-primary-input-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-button-font': theme.config.themeColors['c-primary-alpha-100'],
    'c-button-font-selected': theme.config.themeColors['c-primary-dark-100-alpha-100'],
    'c-button-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-button-background-selected': theme.config.themeColors['c-primary-alpha-600'],
    'c-button-background-hover': theme.config.themeColors['c-primary-light-300-alpha-600'],
    'c-button-background-active': theme.config.themeColors['c-primary-light-100-alpha-600'],
    'c-list-header-border-bottom': theme.config.themeColors['c-primary-alpha-900'],
    'c-content-background': theme.config.themeColors['c-primary-light-1000'],
    'c-border-background': theme.config.themeColors['c-primary-light-100-alpha-700'],
    'bg-image': bgImg,
    'bg-image-portrait': bgImgPortrait,
    'bg-image-landscape': bgImgLandscape,
    // 主题字体（Android 系统字体别名，空串表示默认字体）
    'c-font-family': theme.config.extInfo['font-family'] || undefined,
  } as const
}


// const copyTheme = (theme: LX.Theme): LX.Theme => {
//   return {
//     ...theme,
//     config: {
//       ...theme.config,
//       extInfo: { ...theme.config.extInfo },
//       themeColors: { ...theme.config.themeColors },
//     },
//   }
// }
// type IDS = LocalTheme['id']
export const getTheme = async() => {
  // fs.promises.readdir()
  const shouldUseDarkColors = themeState.shouldUseDarkColors
  // let themeId = settingState.setting['theme.id'] == 'auto'
  //   ? shouldUseDarkColors
  //     ? settingState.setting['theme.darkId']
  //     : settingState.setting['theme.lightId']
  //   // : 'china_ink'
  //   : settingState.setting['theme.id']
  let themeId = settingState.setting['common.isAutoTheme'] && shouldUseDarkColors
    ? 'black'
    : settingState.setting['theme.id']
  // themeId = 'naruto'
  // themeId = 'pink'
  // themeId = 'black'
  let theme: LocalTheme | LX.Theme | undefined = themes.find(theme => theme.id == themeId)
  if (!theme) {
    userThemes = await getUserTheme()
    theme = userThemes.find(theme => theme.id == themeId)
    if (!theme) {
      themeId = settingState.setting['theme.id'] == 'auto' && shouldUseDarkColors ? 'black' : 'green'
      theme = themes.find(theme => theme.id == themeId) as LX.Theme
    }
  }

  return theme
}
