#!/usr/bin/env node
/**
 * 发布前隐私检查。
 *
 * 分两档，避免把上游公开信息和示例值当成问题：
 *
 *   block —— 出现即失败，不允许发版
 *            本仓库所有者的标识（邮箱/昵称/设备序列号/内网 IP/本机绝对路径）
 *            + 真实密钥（私钥正文、签名口令字面值、GitHub token、网盘 Cookie）
 *
 *   warn  —— 只打印，不阻断
 *            通用邮箱、QQ 号、局域网 IP 等，多来自上游文档、npm 锁文件、示例配置
 *
 * 例外写在 .github/privacy-allowlist.txt，一行一条：`规则名 | 文件路径正则`。
 *
 * 用法：node scripts/privacy-check.mjs [--strict]
 *   --strict 时 warn 也视为失败（发版前想收紧时用）
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const STRICT = process.argv.includes('--strict')

const BLOCK_RULES = [
  { name: 'owner-email', desc: '所有者真实邮箱', re: /wen040806@[A-Za-z0-9.-]+/g },
  { name: 'owner-name', desc: '所有者昵称', re: /不悔莉达/g },
  { name: 'owner-serial', desc: '调试设备序列号', re: /\b10AC6506QK001G8\b/g },
  { name: 'owner-lan-ip', desc: '所有者内网 IP', re: /\b192\.168\.210\.182\b/g },
  {
    name: 'owner-path',
    desc: '本机绝对路径',
    re: /\b[A-Za-z]:[\\/]{1,2}(?:Users[\\/]lida|workbuddy-workspace|lx-yz|lxmusic|Android_SDK)(?:[^\s'"`)]*)?/g,
  },
  { name: 'owner-home', desc: '本机 POSIX 家目录', re: /\/Users\/lida\b/g },
  { name: 'phone-cn', desc: '手机号', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  {
    name: 'private-key',
    desc: '私钥正文',
    re: /BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]{0,40}[A-Za-z0-9+/]{40,}/g,
  },
  {
    name: 'signing-secret',
    desc: '签名口令字面值（非 $变量 占位）',
    re: /(?:storePassword|keyPassword)\s*=\s*(?!\$)[^\s"'`]{3,}/g,
  },
  { name: 'gh-token', desc: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'pan-cookie', desc: '百度网盘 Cookie 实值', re: /BDUSS=[A-Za-z0-9%._-]{20,}/g },
]

const WARN_RULES = [
  {
    name: 'email-public',
    desc: '真实邮箱（上游/依赖作者属正常）',
    re: /[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  },
  { name: 'qq-number', desc: 'QQ 号', re: /\bQQ[:：\s]*([1-9]\d{4,10})\b/gi },
  { name: 'lan-ip', desc: '局域网 IP（多为示例）', re: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
]

const SKIP_FILES = [
  /^node_modules\//,
  /^package-lock\.json$/,
  /^vendor\//,
  // 检查器自身的规则里必然写着这些字面量（否则没法匹配），不扫自己。
  // 这也意味着：往这个文件里塞真实信息不会被自己发现，改它时需人工复核。
  /^scripts\/privacy-check\.mjs$/,
]
const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|ttf|otf|woff2?|so|a|aar|jar|apk|keystore|jks|zip|gz|mp3|mp4|db|bundle|hprof)$/i

const ALLOW_FILE = '.github/privacy-allowlist.txt'
const allow = []
if (existsSync(ALLOW_FILE)) {
  for (const line of readFileSync(ALLOW_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [rule, pathRe] = trimmed.split('|').map(part => part.trim())
    if (rule && pathRe) allow.push({ rule, pathRe: new RegExp(pathRe) })
  }
}
const isAllowed = (rule, file) => allow.some(item => item.rule === rule && item.pathRe.test(file))

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map(f => f.trim())
  .filter(Boolean)
  .filter(f => !BINARY_EXT.test(f))
  .filter(f => !SKIP_FILES.some(re => re.test(f)))

const scan = (rules) => {
  const hits = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) continue
    const lines = text.split(/\r?\n/)
    for (const rule of rules) {
      if (isAllowed(rule.name, file)) continue
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line || line.length > 1000) continue
        rule.re.lastIndex = 0
        const m = rule.re.exec(line)
        if (m) {
          hits.push({ file, line: i + 1, rule: rule.name, desc: rule.desc, sample: m[0].slice(0, 60) })
        }
      }
    }
  }
  return hits
}

const blocked = scan(BLOCK_RULES)
const warned = scan(WARN_RULES)

const report = (title, items) => {
  if (!items.length) return
  console.error(`\n${title}（${items.length} 处）`)
  const byFile = new Map()
  for (const item of items) {
    if (!byFile.has(item.file)) byFile.set(item.file, [])
    byFile.get(item.file).push(item)
  }
  for (const [file, list] of byFile) {
    console.error(`  ${file}`)
    for (const item of list.slice(0, 5)) {
      console.error(`    ${item.line}:1  [${item.rule}] ${item.desc} -> ${item.sample}`)
    }
    if (list.length > 5) console.error(`    …还有 ${list.length - 5} 处`)
  }
}

report('阻断项', blocked)
report('提醒项', warned)

if (!blocked.length && (!STRICT || !warned.length)) {
  console.log(`\n隐私检查通过：扫描 ${files.length} 个文件，阻断项 0，提醒项 ${warned.length}`)
  process.exit(0)
}

if (blocked.length) {
  console.error('\n隐私检查失败：存在阻断项，禁止发布。')
  console.error('确认无风险后，把「规则名 | 文件路径正则」写进 .github/privacy-allowlist.txt')
  process.exit(1)
}

console.error('\n隐私检查失败（--strict 模式）：提醒项也视为阻断。')
process.exit(1)
