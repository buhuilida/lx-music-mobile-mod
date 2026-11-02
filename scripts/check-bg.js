/**
 * 校验「自定义主题背景」在所有主题下的可读性：
 * 设置背景图后 c-main-background 会变成半透明蒙层，
 * 这里模拟最差情况（背景图为中灰 / 纯白 / 纯黑），计算字体色与合成底色的对比度。
 * 用法：node scripts/check-bg.js
 */
const { createThemeColors } = require('../src/theme/themes/utils.js')
const fs = require('fs')
const path = require('path')

// 从生成的 themes.ts 拿到主题列表
const themesPath = path.join(__dirname, '../src/theme/themes/themes.ts')
const source = fs.readFileSync(themesPath, 'utf8')
const jsonText = source.replace(/^[\s\S]*?export default /, '').replace(/ as const\s*$/, '')
const defaultThemes = JSON.parse(jsonText)

const withAlpha = (color, alpha) => {
  const match = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (!match) return `rgba(255,255,255,${alpha})`
  const [r, g, b] = match[1].split(',').map(p => p.trim())
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const parseRgba = (color) => {
  const m = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (!m) return [255, 255, 255, 1]
  const parts = m[1].split(',').map(p => p.trim())
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] != null ? Number(parts[3]) : 1]
}

const composite = (fg, bg) => {
  const [fr, fg_, fb, fa] = parseRgba(fg)
  const [br, bg2, bb] = parseRgba(bg)
  const a = fa + (1 - fa) * 0 // fg over photo
  // photo color = bg
  return [fr * fa + br * (1 - fa), fg_ * fa + bg2 * (1 - fa), fb * fa + bb * (1 - fa)]
}

const luminance = ([r, g, b]) => {
  const f = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const contrast = (c1, c2) => {
  const l1 = luminance(c1)
  const l2 = luminance(c2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

let fail = 0
for (const theme of defaultThemes) {
  const colors = theme.config.themeColors
  const base = colors['c-850'] // 字体主色近似 c-font
  // 浅色主题有背景图时，c-font-label 会改用更深的 c-650（见 buildActiveThemeColors）
  const label = theme.isDark ? colors['c-450'] : colors['c-650']
  const mainBgRaw = theme.config.extInfo['c-main-background'] || (theme.isDark ? 'rgb(19, 19, 19)' : 'rgb(255, 255, 255)')
  const overlay = withAlpha(mainBgRaw, theme.isDark ? 0.78 : 0.72)
  for (const photo of ['rgb(128, 128, 128)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)']) {
    const [r, g, b] = composite(overlay, photo)
    for (const [name, font, min] of [['font', base, 4.5], ['label', label, 2]]) {
      const c = contrast(parseRgba(font).slice(0, 3).concat([1]), [r, g, b, 1])
      if (c < min) {
        fail++
        console.log(`FAIL ${theme.id}(${theme.name}) ${name} vs photo ${photo}: ${c.toFixed(2)} (< ${min})`)
      }
    }
  }
  console.log(`ok  ${theme.id.padEnd(14)} ${theme.name.padEnd(6)} overlay=${overlay}`)
}
console.log(fail === 0 ? '\nBG CHECK PASSED' : `\nBG CHECK FAILED: ${fail}`)
process.exit(fail === 0 ? 0 : 1)
