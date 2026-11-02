/**
 * WebDAV 备份 / 恢复
 *
 * 备份内容：全部歌单（默认列表 / 我的收藏 / 自建歌单）、全部设置、自定义源脚本。
 * 云端目录：{WebDAV根}/lx-music-mod-sync/
 *   - meta.json   轻量信息（备份时间、设备、数量），恢复前用于预览
 *   - backup.json 完整备份
 */
import settingState from '@/store/setting/state'
import listState from '@/store/list/state'
import { getListMusics, overwriteListFull } from '@/core/list'
import { addUserApi } from '@/utils/data'
import { updateSetting } from '@/core/common'
import { filterMusicList, fixNewMusicInfoQuality } from '@/utils'
import { getFile, putFile, type WebDAVConfig } from './webdav'

const BACKUP_VERSION = 1

/** 恢复设置时跳过的键：本地专属路径与 WebDAV 配置本身 */
const SKIP_SETTING_KEYS = [
  'theme.customBgImage',
  'sync.webdavUrl',
  'sync.webdavUser',
  'sync.webdavPassword',
] as const

export interface WebdavBackupData {
  client: 'lx-music-mobile-mod'
  backupVersion: number
  at: number
  device: string
  settings: Partial<LX.AppSetting>
  lists: Array<LX.List.MyDefaultListInfoFull | LX.List.MyLoveListInfoFull | LX.List.UserListInfoFull>
  userApis: Array<{ info: LX.UserApi.UserApiInfo, script: string }>
}

export interface WebdavMeta {
  at: number
  device: string
  counts: { lists: number, musics: number, userApis: number }
}

export const getDeviceName = () => `${(global.lx as unknown as { version?: string }).version ?? 'LX Music'} · Android`

const getAllLists = async() => {
  const lists: Array<WebdavBackupData['lists'][number]> = []
  lists.push(await getListMusics(listState.defaultList.id).then(musics => ({ ...listState.defaultList, list: musics })))
  lists.push(await getListMusics(listState.loveList.id).then(musics => ({ ...listState.loveList, list: musics })))
  for await (const list of listState.userList) {
    lists.push(await getListMusics(list.id).then(musics => ({ ...list, list: musics })))
  }
  return lists
}

/**
 * 收集本地数据（设置 + 歌单 + 自定义源）
 */
export const collectBackup = async(): Promise<WebdavBackupData> => {
  const { getUserApiList, getUserApiScript } = await import('@/utils/data')
  const userApis: WebdavBackupData['userApis'] = []
  for (const info of await getUserApiList()) {
    try {
      const script = await getUserApiScript(info.id)
      if (script) userApis.push({ info, script })
    } catch {}
  }

  const settings: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settingState.setting)) {
    if ((SKIP_SETTING_KEYS as readonly string[]).includes(key)) continue
    settings[key] = value
  }

  return {
    client: 'lx-music-mobile-mod',
    backupVersion: BACKUP_VERSION,
    at: Date.now(),
    device: getDeviceName(),
    settings: settings as Partial<LX.AppSetting>,
    lists: await getAllLists(),
    userApis,
  }
}

const countMusics = (data: WebdavBackupData) => data.lists.reduce((sum, list) => sum + (list.list?.length ?? 0), 0)

/**
 * 备份到 WebDAV，返回云端 meta
 */
export const backupToWebdav = async(config: WebDAVConfig): Promise<WebdavMeta> => {
  const data = await collectBackup()
  const meta: WebdavMeta = {
    at: data.at,
    device: data.device,
    counts: {
      lists: data.lists.length,
      musics: countMusics(data),
      userApis: data.userApis.length,
    },
  }
  await putFile(config, 'backup.json', JSON.stringify(data))
  await putFile(config, 'meta.json', JSON.stringify(meta))
  return meta
}

/**
 * 读取云端备份概要（不拉取完整备份）
 */
export const readWebdavMeta = async(config: WebDAVConfig): Promise<WebdavMeta> => {
  const raw = await getFile(config, 'meta.json')
  const meta = JSON.parse(raw) as WebdavMeta
  if (!meta || typeof meta.at != 'number') throw new Error('bad meta')
  return meta
}

const applyLists = async(lists: WebdavBackupData['lists']) => {
  const allLists = lists.map(list => ({
    ...list,
    list: filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m)),
  }))
  const defaultList = allLists.shift()!.list
  const loveList = allLists.shift()!.list
  await overwriteListFull({ defaultList, loveList, userList: allLists as LX.List.UserListInfoFull[] })
}

/**
 * 从 WebDAV 恢复：设置 + 歌单 + 自定义源（云端数据覆盖本地）
 */
export const restoreFromWebdav = async(config: WebDAVConfig): Promise<WebdavMeta> => {
  const raw = await getFile(config, 'backup.json')
  const data = JSON.parse(raw) as WebdavBackupData
  if (!data || data.client != 'lx-music-mobile-mod') throw new Error('bad backup')

  const settings: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data.settings ?? {})) {
    if ((SKIP_SETTING_KEYS as readonly string[]).includes(key)) continue
    settings[key] = value
  }
  updateSetting(settings as Partial<LX.AppSetting>)

  if (Array.isArray(data.lists) && data.lists.length >= 2) {
    await applyLists(data.lists)
  }

  for (const api of data.userApis ?? []) {
    try {
      if (api?.script) await addUserApi(api.script)
    } catch (err) {
      console.log('webdav restore user api failed', err)
    }
  }

  return {
    at: data.at,
    device: data.device,
    counts: {
      lists: data.lists?.length ?? 0,
      musics: countMusics(data),
      userApis: data.userApis?.length ?? 0,
    },
  }
}
