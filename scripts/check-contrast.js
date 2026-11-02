#!/usr/bin/env node
/**
 * 一起听页面配色的可读性检查。
 *
 * 背景：房间页的卡片曾经用 `c-primary-alpha-100`（主色 90% 不透明）当底色，
 * 一旦主题主色偏深，卡片就是一整块深灰，而文字仍是主题字体色 → 糊成一片。
 *
 * 这个脚本做两件事：
 * 1. 遍历内置主题，计算「卡片底 + 字体」的 WCAG 对比度，旧写法必须被判为不合格，新写法必须合格；
 * 2. 静态扫描 src 下把高不透明度主色当大块背景的写法，避免同样的坑再出现。
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

const parseColor = (value) => {
  const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] == null ? 1 : Number(m[4]) }
}

const blend = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
})

const luminance = ({ r, g, b }) => {
  const f = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const contrast = (a, b) => {
  const l1 = luminance(a)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// 读取内置主题
const themesSource = fs.readFileSync(path.join(root, 'src/theme/themes/themes.ts'), 'utf8')
const start = themesSource.indexOf('[')
const end = themesSource.lastIndexOf(']')
const themes = new Function(`return ${themesSource.slice(start, end + 1)}`)()

const WHITE = { r: 255, g: 255, b: 255, a: 1 }
const BLACK = { r: 0, g: 0, b: 0, a: 1 }

/** 卡片底在「纯白背景图」与「纯黑背景图」两种极端下的最差对比度 */
const worstContrast = (cardValue, fontValue) => {
  const card = parseColor(cardValue)
  const font = parseColor(fontValue)
  if (!card || !font) return null
  return Math.min(
    contrast(font, blend(card, WHITE)),
    contrast(font, blend(card, BLACK)),
  )
}

let failed = 0
console.log('内置主题下「房间码卡片」的文字对比度（WCAG 正文要求 ≥ 4.5）：\n')
console.log(`${'主题'.padEnd(18)} ${'主色'.padEnd(20)} ${'旧写法'.padEnd(9)} ${'新写法'.padEnd(9)}`)
console.log('-'.repeat(70))

let oldBad = 0
let newBad = 0
for (const theme of themes) {
  const colors = theme.config.themeColors
  const font = colors['c-850']
  const oldCard = colors['c-primary-alpha-100']
  const newCard = colors['c-primary-light-1000-alpha-200']
  const oldRatio = worstContrast(oldCard, font)
  const newRatio = worstContrast(newCard, font)
  if (oldRatio != null && oldRatio < 4.5) oldBad++
  if (newRatio == null || newRatio < 4.5) newBad++
  const flag = newRatio != null && newRatio < 4.5 ? '  <-- FAIL' : ''
  console.log(
    `${String(theme.name).padEnd(16)} ${String(theme.config.themeColors['c-primary']).padEnd(20)} ` +
    `${oldRatio.toFixed(2).padEnd(9)} ${newRatio.toFixed(2).padEnd(9)}${flag}`,
  )
}

console.log(`\n共 ${themes.length} 个主题：旧写法不合格 ${oldBad} 个，新写法不合格 ${newBad} 个`)
if (newBad) failed++

// 静态扫描：高不透明度主色被用作大块背景
const suspicious = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!/\.tsx?$/.test(entry.name)) continue
    const code = fs.readFileSync(full, 'utf8')
    const lines = code.split('\n')
    lines.forEach((line, i) => {
      // 只关心背景色，文字色用主色是正常的
      if (!/backgroundColor:\s*theme\['c-primary-alpha-(100|200|300)'\]/.test(line)) return
      const rel = path.relative(root, full)
      // 一起听房间页已经统一走 surface 色，这里出现即为回退
      suspicious.push(`${rel}:${i + 1}  ${line.trim()}`)
    })
  }
}
walk(path.join(root, 'src'))

if (suspicious.length) {
  console.log('\n把 ≥70% 不透明的主色当背景的地方（容易在深色主题下糊成一块）：')
  for (const item of suspicious) console.log('  ' + item)
  failed++
} else {
  console.log('\n没有发现把高不透明度主色当大块背景的写法')
}

if (failed) {
  console.error('\nCONTRAST CHECKS FAILED')
  process.exit(1)
}
console.log('\nCONTRAST CHECKS PASSED')
