import { httpGet } from '@/utils/request'
import { author, name } from '../../package.json'
import { downloadFile, stopDownload, temporaryDirectoryPath, readDir, stat, unlink } from '@/utils/fs'
import { getSupportedAbis, installApk, getPackageName } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

/**
 * 二改版的更新检查地址（与一起听服务器同域，下载页也在这里）。
 * 分享链接网关要求所有请求都带 sharecode。
 * 原版的 GitHub / npm 源更新的是原版安装包，对二改版没有意义，因此不再使用。
 */
const address = [
  ['https://aa9247f7339b2cb18.app.workbuddy.host/downloads/version.json?sharecode=ER6OKBO4HG', 'direct'],
  // 备用源必须也是「新包名清单」：旧站的 version.json 服务的是 1.22.17 及更早的老版本，
  // 里面指向的是原包名包 cn.toside.music.mobile，新包名用户装上去是另一个应用。
  ['https://af384ee6deb6e09e2.app.workbuddy.host/downloads/version-newpkg.json?sharecode=MKPWEVLBUS', 'direct'],
]
// 原包名版（cn.toside.music.mobile）单独一份清单：它如果去拉新包名版的清单，
// 会下载到 com.lxmod.music 的安装包，装上去是另一个应用，覆盖不了自己，
// 用户看到的现象就是「点了更新，版本号没变」。
const addressOrigPkg = [
  ['https://aa9247f7339b2cb18.app.workbuddy.host/downloads/version-orig.json?sharecode=ER6OKBO4HG', 'direct'],
  // 旧站的 version.json 就是原包名清单，可以直接作为回退源
  ['https://af384ee6deb6e09e2.app.workbuddy.host/downloads/version.json?sharecode=MKPWEVLBUS', 'direct'],
]
let cachedAddressList
const getAddressList = async() => {
  if (cachedAddressList) return cachedAddressList
  // getPackageName 走原生桥，理论上可能 reject（桥未就绪、模块缺失）。
  // 这里不能让它冒泡：一旦抛错，检查更新会直接失败，用户只看到「检查更新失败」，
  // 却不知道只是拿包名失败。拿不到就按新包名清单走。
  let pkg = null
  try {
    pkg = await getPackageName()
  } catch {}
  cachedAddressList = pkg == 'cn.toside.music.mobile' ? addressOrigPkg : address
  return cachedAddressList
}


const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
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
      .filter(path => /\/lx-music-mobile.*\.apk$/i.test(path))
    for (const path of targets) {
      await unlink(path).catch(() => {})
    }
  } catch {}
}

export const downloadNewVersion = async(version, onDownload = noop) => {
  const abi = await getTargetAbi()
  // 优先使用版本信息里下发的下载地址（二改版自建下载页），没有时回退到 GitHub
  const modDownload = latestInfo?.download
  let url = typeof modDownload === 'string' && modDownload
    ? modDownload
    // 清单里只提供 arm64-v8a / universal / backscreen 三个键。
    // 32 位机型（armeabi-v7a）或模拟器（x86）取不到自己的键，
    // 以前会直接落到 GitHub 回退 —— 那是原版洛雪的安装包，装上去等于换了个应用。
    // 这里先退到 universal（全架构包），真的没有才走 GitHub。
    : modDownload?.[abi] || modDownload?.universal ||
      `https://github.com/${author.name}/${name}/releases/download/v${version}/${name}-v${version}-${abi}.apk`
  // 版本信息里可能是相对路径（如 /downloads/xx.apk 或 downloads/xx.apk），下载器需要完整 URL
  if (!/^https?:\/\//i.test(url)) {
    const origin = latestInfoOrigin || 'https://af384ee6deb6e09e2.app.workbuddy.host'
    url = origin + (url.startsWith('/') ? '' : '/') + url
  }

  // 关键修复（1.21.0）：安装包文件名必须带版本号，下载前还要把旧包删干净。
  // 旧实现固定用 cache/lx-music-mobile.apk，只要上一次下载中断（或系统保留了
  // 旧文件），RNFS 复用同名文件就会把上一个版本的包当成这次更新装上去 ——
  // 表现就是「更新日志已经是新版，装完还是旧版本」。
  // 安装包地址也带时间戳：同一版本号重传过安装包时，不能让 CDN 把旧包发回来
  url = withCacheBust(url)
  const savePath = `${temporaryDirectoryPath}/lx-music-mobile-${version}-${abi}.apk`
  await removeStaleApks()

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
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
  return promise.then(async() => {
    // 下完必须确认文件真的落了盘：大小不对就报错，绝不拿旧包去安装
    const info = await stat(savePath).catch(() => null)
    if (!info || !info.size || info.size < 1024 * 1024) {
      throw new Error(`downloaded apk is invalid: ${info?.size ?? 0}`)
    }
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  // FileProvider 的 authority 是 `${applicationId}.provider`，
  // backscreen 变体的 applicationId 不是 APP_PROVIDER_NAME 里的那个包名，必须取实际值
  const packageName = await getPackageName().catch(() => null)
  await installApk(apkSavePath, packageName ? `${packageName}.provider` : APP_PROVIDER_NAME)
}
