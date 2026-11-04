import { httpGet } from '@/utils/request'
import { downloadFile, stopDownload, temporaryDirectoryPath, readDir, stat, unlink } from '@/utils/fs'
import { getPackageName, getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

/**
 * 更新源：本仓库的 GitHub Releases + 国内镜像。
 *
 * 国内直连 github.com 经常超时，所以清单和安装包都「先镜像、后回源」：
 *   镜像地址 = 加速前缀 + 原始地址（ghfast.top / gh-proxy.com 两个轮着试）
 *   回源地址 = jsDelivr（清单）/ raw / releases 原始地址
 * 清单固定取 releases/latest/download/version.json，不走 GitHub API，没有限流。
 *
 * 为什么按包名分开下：本仓库有两个变体，装的是哪个就必须下哪个，
 * 否则会把 com.lxmod.music 的包装到 cn.lxmusic.mod 上（系统直接拒装）。
 */
const REPO = 'buhuilida/lx-music-mobile-mod'
const RELEASE_BASE = `https://github.com/${REPO}/releases`

/** 国内 GitHub 加速镜像（镜像地址 = 前缀 + 原始地址） */
const GITHUB_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
]
const mirrorUrls = (url) => GITHUB_MIRRORS.map(prefix => `${prefix}${url}`)

const address = [
  // 1. 镜像优先：国内直连 github.com 的成功率太低
  ...mirrorUrls(`${RELEASE_BASE}/latest/download/version.json`).map(url => [url, 'direct']),
  // 2. jsDelivr CDN：仓库里同步维护了一份清单，国内通常可直连
  [`https://cdn.jsdelivr.net/gh/${REPO}@main/release/version.json`, 'direct'],
  // 3. 回源：镜像全挂时再试原始地址
  [`${RELEASE_BASE}/latest/download/version.json`, 'direct'],
  [`https://raw.githubusercontent.com/${REPO}/main/release/version.json`, 'direct'],
]
const getAddressList = async() => address


const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      // 更新清单是「多源依次试」，单源必须尽快失败，否则用户要干等两三分钟
      timeout: 8000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 1
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

let latestInfo = null
/** 版本信息所在的站点根（用于把相对下载地址拼成完整 URL） */
let latestInfoOrigin = ''

/**
 * 给 URL 加时间戳，绕过 CDN 缓存。
 *
 * 后端 /downloads 下的文件带 `cache-control: public, max-age=3600`，
 * 同一个版本号重传安装包（修 bug 后重编而不改版本）时，CDN 会继续吐旧文件；
 * version.json 同理，发布会后一小时内可能还是旧的。
 * 这是「日志是新的、安装包还是旧的」的另一半原因。
 */
const withCacheBust = (url) => `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`

const getDirectInfo = async(url) => {
  return request(withCacheBust(url)).then(info => {
    if (info.version == null) throw new Error('failed')
    latestInfo = info
    try {
      latestInfoOrigin = new URL(url).origin
    } catch {
      latestInfoOrigin = ''
    }
    return info
  })
}

const getNpmPkgInfo = async(url) => {
  return request(url).then(json => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

export const getVersionInfo = async(index = 0) => {
  const list = await getAddressList()
  const [url, source] = list[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
  }

  return promise.catch(async(err) => {
    index++
    if (index >= list.length) throw err
    return getVersionInfo(index)
  })
}

const getTargetAbi = async() => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}
let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

/**
 * 清掉缓存目录里以前下载过的安装包（任意版本、任意架构）。
 * 这些文件每个都十几到三十几 MB，留着既占空间，又是「装到旧包」的根源。
 */
async function removeStaleApks() {
  try {
    const items = await readDir(temporaryDirectoryPath)
    const targets = (items || [])
      .map(item => item.path || `${temporaryDirectoryPath}/${item.name}`)
      // 本仓库产物的文件名是 lxmod-*，历史版本是 lx-music-mobile-*，两种都要清
      .filter(path => /\/(lx-music-mobile|lxmod).*\.apk$/i.test(path))
    for (const path of targets) {
      await unlink(path).catch(() => {})
    }
  } catch {}
}

export const downloadNewVersion = async(version, onDownload = noop) => {
  const abi = await getTargetAbi()
  // 优先使用版本信息里下发的下载地址（二改版自建下载页），没有时回退到 GitHub
  // 装的是哪个变体就下哪个变体的包：standard=com.lxmod.music，共存版=cn.lxmusic.mod
  const pkg = await getPackageName().catch(() => null)
  const perPkg = pkg ? latestInfo?.downloadByPackage?.[pkg] : null
  const modDownload = perPkg ?? latestInfo?.download
  let url = typeof modDownload === 'string' && modDownload
    ? modDownload
    // 清单里没有对应 abi 时退到 universal（全架构包），再没有才按 assets 命名规则猜
    : modDownload?.[abi] || modDownload?.universal ||
      `${RELEASE_BASE}/download/v${version}/lxmod-v${version}-${abi}.apk`
  // 版本信息里可能是相对路径（如 /downloads/xx.apk 或 downloads/xx.apk），下载器需要完整 URL
  if (!/^https?:\/\//i.test(url)) {
    const origin = latestInfoOrigin || RELEASE_BASE
    url = origin + (url.startsWith('/') ? '' : '/') + url
  }

  // 关键修复（1.21.0）：安装包文件名必须带版本号，下载前还要把旧包删干净。
  // 旧实现固定用 cache/lx-music-mobile.apk，只要上一次下载中断（或系统保留了
  // 旧文件），RNFS 复用同名文件就会把上一个版本的包当成这次更新装上去 ——
  // 表现就是「更新日志已经是新版，装完还是旧版本」。
  const savePath = `${temporaryDirectoryPath}/lx-music-mobile-${version}-${abi}.apk`
  await removeStaleApks()

  const startDownload = (target) => {
    if (downloadJobId) stopDownload(downloadJobId)
    // 安装包地址带时间戳：同一版本号重传过安装包时，不能让 CDN 把旧包发回来
    const { jobId, promise } = downloadFile(withCacheBust(target), savePath, {
      progressInterval: 500,
      connectionTimeout: 20000,
      readTimeout: 30000,
      begin({ statusCode, contentLength }) {
        onDownload(contentLength, 0)
      },
      progress({ contentLength, bytesWritten }) {
        onDownload(contentLength, bytesWritten)
      },
    })
    downloadJobId = jobId
    return promise
  }

  // 先镜像后回源：国内直连 github.com 大概率超时，逐个候选地址试，
  // 每个候选都完整下完并验大小，失败就删掉残留换下一个。
  const candidates = [...new Set([...mirrorUrls(url), url])]
  let lastErr
  for (const candidate of candidates) {
    try {
      await startDownload(candidate)
      // 下完必须确认文件真的落了盘：大小不对就报错，绝不拿旧包去安装
      const info = await stat(savePath).catch(() => null)
      if (!info || !info.size || info.size < 1024 * 1024) {
        throw new Error(`downloaded apk is invalid: ${info?.size ?? 0}`)
      }
      apkSavePath = savePath
      return await updateApp()
    } catch (err) {
      lastErr = err
      // 镜像返回错误页时也会写成小文件，必须清掉，否则下一个候选会读到脏文件
      await unlink(savePath).catch(() => {})
    }
  }
  throw lastErr ?? new Error('download failed')
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  // FileProvider authority 必须与实际包名一致，否则改过包名的变体（如 backscreen）安装会失败
  let authority = APP_PROVIDER_NAME
  try {
    const packageName = await getPackageName()
    if (packageName) authority = `${packageName}.provider`
  } catch {}
  await installApk(apkSavePath, authority)
}
