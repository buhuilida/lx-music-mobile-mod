/**
 * 本地备份 / 恢复
 *
 * 与 WebDAV 备份共用同一份数据结构与恢复逻辑（`collectBackup` / `applyBackup`），
 * 区别只是落地介质：本地文件，不依赖网络和第三方账号。
 *
 * 备份内容：全部歌单、全部设置（含各平台 Cookie / 音源开关）、自定义音源脚本。
 * 文件格式：JSON，文件名 `lxmod-backup-YYYYMMDD-HHmmss.json`。
 */
import { existsFile, mkdir, readFile, writeFile } from '@/utils/fs'
import { privateDownloadDirectoryPath, resolveDownloadDirectory } from '@/core/download'
import { applyBackup, collectBackup, countBackup, isValidBackup, type WebdavBackupData } from './webdavBackup'

export const LOCAL_BACKUP_PREFIX = 'lxmod-backup-'

const pad = (n: number) => String(n).padStart(2, '0')

const buildFileName = (date = new Date()) => {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${LOCAL_BACKUP_PREFIX}${stamp}.json`
}

const writeTo = async(dir: string, name: string, data: WebdavBackupData) => {
  await mkdir(dir).catch(() => {})
  const path = `${dir}/${name}`
  await writeFile(path, JSON.stringify(data))
  return path
}

export interface LocalBackupResult {
  path: string
  at: number
  counts: { lists: number, musics: number, userApis: number }
}

/**
 * 导出本地备份文件，返回落盘路径与内容统计。
 *
 * 优先写下载目录（用户能在文件管理器里找到，方便换机/上传网盘），
 * 没有存储权限或写入失败时回退到应用私有目录。
 */
export const exportLocalBackup = async(): Promise<LocalBackupResult> => {
  const data = await collectBackup()
  const name = buildFileName()
  const dir = await resolveDownloadDirectory()
  let path: string
  try {
    path = await writeTo(dir, name, data)
    if (!await existsFile(path)) throw new Error('write failed')
  } catch {
    path = await writeTo(privateDownloadDirectoryPath, name, data)
  }
  return {
    path,
    at: data.at,
    counts: countBackup(data),
  }
}

/** 备份文件大小上限：正常备份（几千首歌）通常 1~5 MB */
const MAX_BACKUP_BYTES = 20 * 1024 * 1024

/**
 * 读取并校验备份文件。
 *
 * JSON.parse 是在 JS 线程同步执行的：选错文件（比如上百 MB 的日志或压缩包改名成 .json）
 * 会把线程占满十几秒，界面直接卡死。所以先按文件大小挡一道。
 */
const parseBackup = async(path: string): Promise<WebdavBackupData> => {
  const raw = await readFile(path)
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('backup too large')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('invalid backup')
  }
  if (!isValidBackup(data)) throw new Error('invalid backup')
  return data
}

/**
 * 从本地文件恢复备份（调用方须先让用户确认覆盖）。
 */
export const importLocalBackup = async(path: string) => {
  return applyBackup(await parseBackup(path))
}

/**
 * 只读解析一份备份文件，用于导入前展示「里面有多少歌单/歌曲/音源」。
 */
export const peekLocalBackup = async(path: string) => {
  const data = await parseBackup(path)
  return { at: data.at, device: data.device, ...countBackup(data) }
}
