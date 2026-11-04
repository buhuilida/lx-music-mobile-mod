// import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import ImageBackground from '@/components/common/ImageBackground'
import { useWindowSize } from '@/utils/hooks'
import { useMemo } from 'react'
import { scaleSizeAbsHR } from '@/utils/pixelRatio'
import { defaultHeaders } from './common/Image'
import SizeView from './SizeView'
import { useBgPic } from '@/store/common/hook'
import { useSettingValue } from '@/store/setting/hook'

interface Props {
  children: React.ReactNode
}

const BLUR_RADIUS = Math.max(scaleSizeAbsHR(18), 10)

export default ({ children }: Props) => {
  const theme = useTheme()
  const windowSize = useWindowSize()
  const pic = useBgPic()
  // 开启「使用动态背景」且当前歌有封面时，动态背景优先；
  // 否则走主题背景（含用户自定义主题背景图）
  const isDynamicBg = useSettingValue('theme.dynamicBg')
  // 自定义主题背景图的不透明度与模糊度（1.15.0 移植自 LX-X）
  const customBgOpacity = useSettingValue('theme.customBgOpacity')
  const customBgBlur = useSettingValue('theme.customBgBlur')

  // 主题竖屏 / 横屏背景图（1.22.11）：按当前方向取对应图，未单独设置时回退通用背景图
  const isLandscape = windowSize.width > windowSize.height
  const themeBgImage = (isLandscape
    ? (theme['bg-image-landscape'] ?? theme['bg-image'])
    : (theme['bg-image-portrait'] ?? theme['bg-image']))

  /**
   * source 必须用 useMemo 固定引用。
   * 之前每次 render 都新建 { uri, headers }，RN Image 会认为图片变了重新解码，
   * 解码期间那一帧是黑的——快速点击 / 滚动触发频繁 render 时就会「闪黑」。
   */
  const picSource = useMemo(() => (pic ? { uri: pic, headers: defaultHeaders } : null), [pic])

  const bgHeight = windowSize.height
  const bgWidth = windowSize.width

  const themeComponent = useMemo(() => (
    <View style={{ flex: 1, backgroundColor: theme['c-content-background'], overflow: 'hidden' }}>
      {
        themeBgImage
          ? <ImageBackground
            style={{ position: 'absolute', left: 0, top: 0, height: bgHeight, width: bgWidth, backgroundColor: theme['c-content-background'] }}
            source={themeBgImage}
            resizeMode="cover"
            blurRadius={customBgBlur || 0}
            fadeDuration={0}
          >
          </ImageBackground>
          : null
      }
      <View style={{ flex: 1, flexDirection: 'column', backgroundColor: theme['c-main-background'] }}>
        {children}
      </View>
    </View>
  ), [children, theme, themeBgImage, bgHeight, bgWidth, customBgBlur])

  const picComponent = useMemo(() => {
    return (
      <View style={{ flex: 1, backgroundColor: theme['c-content-background'], overflow: 'hidden' }}>
        <ImageBackground
          style={{ position: 'absolute', left: 0, top: 0, height: bgHeight, width: bgWidth, backgroundColor: theme['c-content-background'] }}
          source={picSource}
          resizeMode="cover"
          blurRadius={BLUR_RADIUS}
          fadeDuration={0}
        >
          <View style={{ flex: 1, flexDirection: 'column', backgroundColor: theme['c-content-background'], opacity: Math.min(1, Math.max(0.3, customBgOpacity)) }}></View>
        </ImageBackground>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {children}
        </View>
      </View>
    )
  }, [children, picSource, theme, bgHeight, bgWidth, customBgOpacity])

  return (
    <>
      <SizeView />
      {picSource && isDynamicBg ? picComponent : themeComponent}
    </>
  )
}
