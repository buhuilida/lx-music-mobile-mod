import settingState from '@/store/setting/state'
import { getData, saveData } from '@/plugins/storage'
import { backupToWebdav } from './webdavBackup'
import type { WebDAVConfig } from './webdav'
import { toast } from '@/utils/tools'

/**
 * WebDAV 自动备份（1.15.0，移植自 LX-X 的自动同步思路）
 * 频率：每次启动 / 每天一次 / 每周一次，启动时静默检查，到期且有配置就备份
 */
const STORAGE_KEY = '@__webdav_auto_backup_last__'

const INTERVALS: Record<string, number> = {
  startup: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

let running = false

const releaseRunning = () => {
  running = false
}

export const checkWebdavAutoBackup = async() => {
  if (running) return
  const mode = settingState.setting['sync.webdavAuto']
  const interval = INTERVALS[mode]
  if (interval == null) return
  const url = settingState.setting['sync.webdavUrl']
  if (!url) return
  running = true
  try {
    const last = await getData<number>(STORAGE_KEY) ?? 0
    if (Date.now() - last < interval) return
    const config: WebDAVConfig = {
      url,
      user: settingState.setting['sync.webdavUser'],
      password: settingState.setting['sync.webdavPassword'],
    }
    await backupToWebdav(config)
    await saveData(STORAGE_KEY, Date.now())
    toast(global.i18n.t('setting_webdav_auto_ok'))
  } catch (err: any) {
    console.warn('webdav auto backup failed:', err?.message)
  } finally {
    releaseRunning()
  }
}
