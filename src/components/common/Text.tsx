import { memo, type ComponentProps } from 'react'
import { Text, type TextProps as _TextProps, StyleSheet, Animated, type ColorValue, type TextStyle } from 'react-native'
import { useTextShadow, useTheme } from '@/store/theme/hook'
import { setSpText } from '@/utils/pixelRatio'
import { useAnimateColor } from '@/utils/hooks/useAnimateColor'
import { DEFAULT_DURATION, useAnimateNumber } from '@/utils/hooks/useAnimateNumber'
// import { AppColors } from '@/theme'

export interface TextProps extends _TextProps {
  /**
   * 字体大小
   */
  size?: number
  /**
   * 字体颜色
   */
  color?: ColorValue
}

// const warpText = <P extends TextProps>(Component: ComponentType<TextProps>) => {
//   return ({ style, size = 15, color, children, ...props }: P) => {
//     const theme = useTheme()
//     return (
//       <Component
//         style={StyleSheet.compose({ fontFamily: 'System', fontSize: setSpText(size), color: color ?? theme['c-font'] }, style)}
//         {...props}
//       >{children}</Component>
//     )
//   }
// }

export default memo(({ style, size = 15, color, children, ...props }: TextProps) => {
  const theme = useTheme()
  const textShadow = useTextShadow()
  // 主题字体（1.22.11）：主题可指定 Android 系统字体别名，style 里显式给了 fontFamily 时不覆盖
  const styleObj = (style && !Array.isArray(style) && typeof style != 'number') ? style as TextStyle : undefined
  const fontFamily = styleObj?.fontFamily ?? theme['c-font-family']
  style = StyleSheet.compose(textShadow ? {
    // fontFamily: 'System',
    textShadowColor: theme['c-primary-dark-300-alpha-800'],
    textShadowOffset: { width: 0.2, height: 0.2 },
    textShadowRadius: 2,
    fontSize: setSpText(size),
    color: color ?? theme['c-font'],
    fontFamily,
  } : {
    // fontFamily: 'System',
    fontSize: setSpText(size),
    color: color ?? theme['c-font'],
    fontFamily,
  }, style)

  return (
    <Text
      style={style}
      {...props}
    >{children}</Text>
  )
})

export interface AnimatedTextProps extends _AnimatedTextProps {
  /**
   * 字体大小
   */
  size?: number
  /**
   * 字体颜色
   */
  color?: ColorValue
}
export const AnimatedText = ({ style, size = 15, color, children, ...props }: AnimatedTextProps) => {
  const theme = useTheme()
  const textShadow = useTextShadow()
  style = StyleSheet.compose(textShadow ? {
    // fontFamily: 'System',
    textShadowColor: theme['c-primary-dark-300-alpha-800'],
    textShadowOffset: { width: 0.2, height: 0.2 },
    textShadowRadius: 2,
    fontSize: setSpText(size),
    color: color ?? theme['c-font'],
  } : {
    // fontFamily: 'System',
    fontSize: setSpText(size),
    color: color ?? theme['c-font'],
  }, style as TextStyle)

  return <Animated.Text style={style} {...props}>{children}</Animated.Text>
}


type _AnimatedTextProps = ComponentProps<(typeof Animated)['Text']>
export interface AnimatedColorTextProps extends _AnimatedTextProps {
  /**
   * 字体大小
   */
  size?: number
  /**
   * 字体颜色
   */
  color?: string
  /**
   * 字体透明度
   */
  opacity?: number
  /**
   * 颜色/透明度过渡时长（ms），默认 800；歌词切行用更短的值更跟手
   */
  duration?: number
}
export const AnimatedColorText = ({ style, size = 15, opacity: _opacity, color: _color, duration, children, ...props }: AnimatedColorTextProps) => {
  const theme = useTheme()
  const textShadow = useTextShadow()

  const [color] = useAnimateColor(_color ?? theme['c-font'], duration)
  const [opacity] = useAnimateNumber(_opacity ?? 1, duration ?? DEFAULT_DURATION, false)

  style = StyleSheet.compose(textShadow ? {
    // fontFamily: 'System',
    textShadowColor: theme['c-primary-dark-300-alpha-800'],
    textShadowOffset: { width: 0.2, height: 0.2 },
    textShadowRadius: 2,
    fontSize: setSpText(size),
    color: color as unknown as ColorValue,
    opacity,
  } : {
    // fontFamily: 'System',
    fontSize: setSpText(size),
    color: color as unknown as ColorValue,
    opacity,
  }, style as TextStyle)

  return <Animated.Text style={style} {...props}>{children}</Animated.Text>
}
