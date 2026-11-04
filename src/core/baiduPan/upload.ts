/**
 * 百度网盘上传（三步：precreate → superfile2 × N → create/commit）
 *
 * 关键点：
 * - 分片固定 4MB；block_list 是「每个分片」的 MD5，顺序必须与文件字节顺序一致
 * - slice-md5（前 256KB）与 content-md5（整文件）百度会校验，不能省
 * - 分片 body 是原始字节（Uint8Array），不是 multipart
 * - return_type === 2 或没有 uploadid → 秒传命中，直接结束
 * - 断点续传：持久化 uploadid + 已成功分片，重试只补缺片
 */
import RNFS from 'react-native-fs'
import { binaryMd5 } from 'react-native-quick-md5'

import { BLOCK_SIZE, SLICE_SIZE, precreate, uploadSlice, createFile, BaiduPanError } from './api'
import { getData, saveData, removeData } from '@/plugins/storage'
import { log } from '@/utils/log'
import { dlog } from '@/utils/debugLog'

const MAX_RETRY = 3
const CONCURRENCY = 2

export interface UploadProgress {
  /** 0 ~ 1 */
  percent: number
  /** 已上传分片数 */
  uploadedParts: number
  totalParts: number
}

export interface UploadOptions {
  /** 本地文件绝对路径 */
  localPath: string
  /** 网盘目标目录，如 `/LX Music` */
  dir: string
  /** 网盘文件名（含扩展名） */
  fileName: string
  onProgress?: (progress: UploadProgress) => void
}

export interface UploadResult {
  remotePath: string
  size: number
  /** 是否秒传命中 */
  rapid: boolean
}

interface ResumeInfo {
  uploadid: string
  path: string
  size: number
  done: number[]
}

const resumeKey = (path: string, size: number) => `@baidu_pan_upload_${path}_${size}`

const normalizeDir = (dir: string) => {
  if (!dir) return '/'
  const trimmed = dir.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const joinPath = (dir: string, name: string) => {
  const base = normalizeDir(dir)
  return base === '/' ? `/${name}` : `${base}/${name}`
}

const readChunkBase64 = async (path: string, position: number, length: number) => {
  return RNFS.read(path, length, position, 'base64')
}

const base64ToBytes = (base64: string): Uint8Array => {
  // 全局 Buffer 由 shim.js 注入（@craftzdog/react-native-buffer）
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** 计算每个 4MB 分片的 MD5（顺序 = 文件字节顺序） */
const buildBlockMd5List = async (path: string, size: number): Promise<string[]> => {
  const list: string[] = []
  if (size === 0) return list
  for (let position = 0; position < size; position += BLOCK_SIZE) {
    const length = Math.min(BLOCK_SIZE, size - position)
    const base64 = await readChunkBase64(path, position, length)
    list.push(binaryMd5(bytesToArrayBuffer(base64ToBytes(base64))))
  }
  return list
}

const sliceMd5 = async (path: string, size: number): Promise<string> => {
  const length = Math.min(SLICE_SIZE, size)
  const base64 = await readChunkBase64(path, 0, length)
  return binaryMd5(bytesToArrayBuffer(base64ToBytes(base64)))
}

const withRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
  let lastError: any
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      // 登录失效 / 参数错误重试也没用
      if (err instanceof BaiduPanError && [4, -6, -9, 31023, 111, 31066].includes(err.code)) break
      log.warn(`[百度网盘] ${label} 第 ${i + 1} 次失败: ${err?.message ?? String(err)}`)
      await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)))
    }
  }
  throw lastError
}

/**
 * 上传文件到百度网盘
 * 已上传的分片记录在本地，重试 / 重启 App 后可续传
 */
export const uploadFileToPan = async (options: UploadOptions): Promise<UploadResult> => {
  const { localPath, dir, fileName, onProgress } = options
  const targetPath = joinPath(dir, fileName)
  const stat = await RNFS.stat(localPath)
  const size = Number(stat.size)
  if (!size) throw new BaiduPanError(-1, 'empty file')

  const totalParts = Math.ceil(size / BLOCK_SIZE)
  dlog('pan', '开始上传', fileName, '目标=' + targetPath, 'size=' + size, '分片=' + totalParts)
  const report = (uploadedParts: number) => {
    onProgress?.({
      percent: uploadedParts / Math.max(totalParts, 1),
      uploadedParts,
      totalParts,
    })
  }

  // 断点续传：先看有没有相同 path + size 的未完成任务
  const storageKey = resumeKey(targetPath, size)
  let resume: ResumeInfo | null = null
  try {
    resume = await getData<ResumeInfo>(storageKey)
  } catch {
    resume = null
  }

  const blockList = await buildBlockMd5List(localPath, size)

  let uploadid = ''
  let pendingParts: number[] = []

  if (resume?.uploadid && resume.size === size && resume.path === targetPath) {
    uploadid = resume.uploadid
    const done = new Set(resume.done ?? [])
    pendingParts = blockList.map((_, index) => index).filter((index) => !done.has(index))
    report(totalParts - pendingParts.length)
    log.info(`[百度网盘] 断点续传：已完成 ${totalParts - pendingParts.length}/${totalParts} 片`)
  } else {
    const slice = await sliceMd5(localPath, size)
    const contentMd5 = await RNFS.hash(localPath, 'md5')
    const pre = await precreate({
      path: targetPath,
      size,
      blockList,
      sliceMd5: slice,
      contentMd5,
    })
    dlog('pan', 'precreate 结果', 'returnType=' + pre.returnType, 'uploadid=' + (pre.uploadid ? pre.uploadid.slice(0, 8) + '…' : '(空)'),
      '待传分片=' + pre.blockList.length, 'rapid=' + pre.rapidUpload)
    if (pre.rapidUpload) {
      await removeData(storageKey).catch(() => {})
      report(totalParts)
      log.info(`[百度网盘] 秒传命中: ${targetPath}`)
      return { remotePath: targetPath, size, rapid: true }
    }
    uploadid = pre.uploadid
    // 服务端只要求补传它给的缺失分片；没给就补全部
    pendingParts = pre.blockList.length
      ? Array.from(new Set(pre.blockList)).filter((index) => index >= 0 && index < totalParts).sort((a, b) => a - b)
      : blockList.map((_, index) => index)
    await saveData(storageKey, { uploadid, path: targetPath, size, done: [] } satisfies ResumeInfo)
  }

  dlog('pan', '待上传分片', pendingParts.length + '/' + totalParts, 'uploadid=' + (uploadid ? uploadid.slice(0, 8) + '…' : '(空)'))
  const doneParts = new Set<number>(blockList.map((_, index) => index).filter((index) => !pendingParts.includes(index)))

  let cursor = 0
  let failed: any = null
  const worker = async () => {
    while (cursor < pendingParts.length) {
      const partseq = pendingParts[cursor]
      cursor++
      try {
        const position = partseq * BLOCK_SIZE
        const length = Math.min(BLOCK_SIZE, size - position)
        const bytes = base64ToBytes(await readChunkBase64(localPath, position, length))
        await withRetry(() => uploadSlice({ path: targetPath, uploadid, partseq, data: bytes }), `分片 ${partseq}`)
        doneParts.add(partseq)
        report(doneParts.size)
        await saveData(storageKey, {
          uploadid,
          path: targetPath,
          size,
          done: Array.from(doneParts),
        } satisfies ResumeInfo).catch(() => {})
      } catch (err: any) {
        dlog('pan', '分片上传失败', 'partseq=' + partseq, err?.message ?? err)
        failed = failed ?? err
        return
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pendingParts.length) }, worker))
  if (failed) {
    // 分片失败后丢弃续传记录：uploadid 可能已过期，
    // 留着会让下次重试继续用同一个失效 id，永远失败（表现为「怎么试都传不上去」）
    dlog('pan', '分片失败，清空续传记录')
    await removeData(storageKey).catch(() => {})
    throw failed
  }

  try {
    const commit = await withRetry(() => createFile({ path: targetPath, size, blockList, uploadid }), '合并分片')
    dlog('pan', 'commit 结果', 'errno=' + (commit?.errno ?? 'none'), 'path=' + targetPath)
  } catch (err: any) {
    dlog('pan', 'commit 失败', 'path=' + targetPath, err?.message ?? err)
    await removeData(storageKey).catch(() => {})
    throw err
  }
  await removeData(storageKey).catch(() => {})
  report(totalParts)
  dlog('pan', '上传完成', targetPath)
  log.info(`[百度网盘] 上传完成: ${targetPath} (${size} bytes)`)

  return { remotePath: targetPath, size, rapid: false }
}
