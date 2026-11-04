#!/usr/bin/env node
/**
 * 生成发布清单 release/version.json。
 *
 * 客户端（src/utils/version.js）只认这个结构：
 *   version / desc / history / download{abi:url} / downloadByPackage{pkg:{abi:url}}
 *
 * 两个变体的包必须分开列：
 *   - 默认 download  -> backscreen（共存版，applicationId cn.lxmusic.mod）
 *   - downloadByPackage['com.lxmod.music'] -> standard（上游默认包名）
 * 装错变体的包会被系统拒绝安装，用户看到的现象是「点了更新没反应」。
 *
 * 用法：node scripts/gen-release-json.js [说明文件路径]
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const versionCode = pkg.versionCode
const tag = `v${version}`
const repo = process.env.GITHUB_REPOSITORY || 'buhuilida/lx-music-mobile-mod'
const base = `https://github.com/${repo}/releases/download/${tag}`

const apkRoot = path.join(root, 'android/app/build/outputs/apk')
const apks = []
const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.apk')) apks.push(full)
  }
}
walk(apkRoot)

const abiOf = (file) => {
  const m = /-(arm64-v8a|armeabi-v7a|x86_64|x86|universal)\.apk$/.exec(file)
  return m ? m[1] : null
}

const modDownload = {}
const standardDownload = {}
for (const file of apks) {
  const abi = abiOf(file)
  if (!abi) continue
  const url = `${base}/${path.basename(file)}`
  if (path.basename(file).includes('-backscreen-')) modDownload[abi] = url
  else standardDownload[abi] = url
}

if (!Object.keys(modDownload).length && !Object.keys(standardDownload).length) {
  console.error('没有找到任何 APK，先跑 assembleRelease')
  process.exit(1)
}

const notesPath = process.argv[2]
let desc = ''
if (notesPath && fs.existsSync(notesPath)) desc = fs.readFileSync(notesPath, 'utf8').trim()

const out = {
  version,
  versionCode,
  desc,
  history: [],
  // 默认给共存版：本仓库的主要产物就是它
  download: Object.keys(modDownload).length ? modDownload : standardDownload,
}
if (Object.keys(standardDownload).length) out.downloadByPackage = { 'com.lxmod.music': standardDownload }

fs.mkdirSync(path.join(root, 'release'), { recursive: true })
fs.writeFileSync(path.join(root, 'release/version.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out, null, 2))
