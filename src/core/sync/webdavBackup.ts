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
  /** 自定义主题（颜色/字体/亮暗；不含本地背景图文件） */
  themes?: LX.Theme[]
}

export interface WebdavMeta {
  at: number
  device: string
  counts: { lists: number, musics: number, userApis: number, themes: number }
}

export const getDeviceName = () => `${(global.lx as unknown as { version?: string }).version ?? 'LX Mod'} · Android`

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
  const { getUserApiList, getUserApiScript, getUserTheme } = await import('@/utils/data')
  // 自定义主题存在独立数据表里，不在 settings 中，必须单独收进来，
  // 否则换包名/换机后用户自己调的主题全部丢失（上一版遗留问题）
  const themes = await getUserTheme()
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
    themes,
  }
}

const countMusics = (data: WebdavBackupData) => (data.lists ?? []).reduce((sum, list) => sum + (list.list?.length ?? 0), 0)

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
      themes: data.themes?.length ?? 0,
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
 * 应用一份备份数据到本地：设置 + 歌单 + 自定义源（备份数据覆盖本地）
 *
 * WebDAV 恢复和本地文件恢复共用这段逻辑，两边格式一致，
 * 避免「云备份能恢复、本地备份恢复不了一半」这种分叉。
 */
export const applyBackup = async(data: WebdavBackupData): Promise<WebdavMeta> => {
  const settings: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data.settings ?? {})) {
    if ((SKIP_SETTING_KEYS as readonly string[]).includes(key)) continue
    settings[key] = value
  }

  // 先恢复歌单，再写设置。
  // 歌单恢复是重活（要遍历、过滤、去重、落库），失败概率远高于写设置；
  // 如果先写设置再恢复歌单，歌单那一步抛错就会留下「设置是备份里的、歌单还是旧的」
  // 这种半套状态，比整份失败更难排查。
  if (Array.isArray(data.lists) && data.lists.length >= 2) {
    await applyLists(data.lists)
  }

  updateSetting(settings as Partial<LX.AppSetting>)

  // 自定义主题：整体覆盖。放在设置写入之后、音源之前，
  // 失败也不影响歌单与设置已经落地。
  if (Array.isArray(data.themes) && data.themes.length > 0) {
    const { saveUserTheme } = await import('@/utils/data')
    try {
      await saveUserTheme(data.themes)
    } catch (err) {
      console.log('restore user themes failed', err)
    }
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
      themes: data.themes?.length ?? 0,
    },
  }
}

/**
 * 从 WebDAV 恢复：设置 + 歌单 + 自定义源（云端数据覆盖本地）
 *
 * 必须先用 isValidBackup 校验：以前只判断 client，lists 缺失的旧备份会一路走到
 * countMusics() 才抛 TypeError —— 而那时设置已经写进本地了，留下半套脏数据。
 */
export const restoreFromWebdav = async(config: WebDAVConfig): Promise<WebdavMeta> => {
  const raw = await getFile(config, 'backup.json')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('bad backup')
  }
  if (!isValidBackup(data)) throw new Error('bad backup')
  return applyBackup(data)
}

/** 备份数据是否合法（本地文件导入前校验） */
export const isValidBackup = (data: unknown): data is WebdavBackupData => {
  const d = data as WebdavBackupData | null
  return !!d && d.client == 'lx-music-mobile-mod' && Array.isArray(d.lists) && !!d.settings
}

/** 备份统计（用于导入前确认框） */
export const countBackup = (data: WebdavBackupData) => ({
  lists: data.lists?.length ?? 0,
  musics: countMusics(data),
  userApis: data.userApis?.length ?? 0,
  themes: data.themes?.length ?? 0,
})
