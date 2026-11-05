/**
 * WebDAV 备份 / 恢复
 *
 * 备份内容：全部歌单（默认列表 / 我的收藏 / 自建歌单）、全部设置、自定义源脚本。
 * 云端目录：{WebDAV根}/lx-music-mod-sync/
 *   - meta.json   轻量信息（备份时间、设备、数量），恢复前用于预览
 *   - backup.json 完整备份
 */
import settingState from '@/store/setting/state'
import { LIST_IDS } from '@/config/constant'
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
  /** 恢复时未能完成的步骤（空数组表示全部成功） */
  warnings?: string[]
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
  const allLists = lists
    // 顶层也可能有 null（数组被手工补过 / 写入中断留下半截 JSON）
    .filter(list => list && typeof list === 'object')
    .map(list => ({
      ...list,
      list: filterMusicList(list.list ?? []).map(m => fixNewMusicInfoQuality(m)),
    }))
  // 按 id 找默认列表 / 收藏列表，不能按数组前两位取。
  // 旧备份、手动改过的备份、第三方工具生成的备份都可能把顺序换掉，
  // 一旦顺序不对，用户的自建歌单会被当成「试听列表」整份覆盖，且现在这份备份
  // 会直接写坏本地数据 —— 比导入失败更糟。
  const defaultList = allLists.find(l => l.id == LIST_IDS.DEFAULT)?.list ?? []
  const loveList = allLists.find(l => l.id == LIST_IDS.LOVE)?.list ?? []
  /**
   * 用户歌单必须清洗后再往下传。
   *
   * 后面的 linkDataOverwrite / listDataOverwrite 会做 `userList.map(({ list, ...info }) => ...)`，
   * 备份里只要有一个 null 项就在解构处抛 TypeError，整个恢复流程中断
   * —— 用户看到的就是笼统的「导入失败」，而且已经写入的试听列表还留在本地。
   *
   * id / name 统一成字符串：旧备份里 id 可能是数字，直接进 SQLite 的 TEXT 列
   * 会因为类型不匹配写失败（overwriteListPosition 的 NOT NULL 约束）。
   */
  const userList = allLists
    .filter(l => l && typeof l === 'object' && l.id != null && l.id != LIST_IDS.DEFAULT && l.id != LIST_IDS.LOVE)
    .map(l => ({
      ...l,
      id: String(l.id),
      name: typeof l.name == 'string' && l.name ? l.name : String(l.id),
      list: Array.isArray(l.list) ? l.list : [],
    }))
  await overwriteListFull({ defaultList, loveList, userList: userList as LX.List.UserListInfoFull[] })
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

  /**
   * 每一步单独兜底，失败只记 warning，不中断后面几步。
   *
   * 以前整段是串行的 await：歌单那一步抛一个 TypeError（备份里某首歌的 meta 缺字段、
   * 某个歌单是 null），后面设置、主题、音源就全不执行，用户看到的是一个笼统的
   * 「导入失败」——既没导进去，也不知道哪一步坏的。
   * 现在按步骤隔离，能恢复的尽量恢复，失败项带回调用方展示。
   */
  const warnings: string[] = []

  // 主题必须最先落地：设置里有 theme.id，指向一个还不存在的自定义主题时，
  // 主题应用那一侧会查不到而回退默认色，用户会觉得「导入后主题丢了」。
  if (Array.isArray(data.themes) && data.themes.length > 0) {
    try {
      const { saveUserTheme } = await import('@/utils/data')
      await saveUserTheme(data.themes)
    } catch (err) {
      warnings.push(`主题 ${String((err as Error)?.message ?? err)}`)
      console.log('restore user themes failed', err)
    }
  }

  if (Array.isArray(data.lists) && data.lists.length >= 2) {
    try {
      await applyLists(data.lists)
    } catch (err) {
      warnings.push(`歌单 ${String((err as Error)?.message ?? err)}`)
      console.log('restore lists failed', err)
    }
  } else {
    warnings.push('歌单 备份里没有歌单数据')
  }

  if (Object.keys(settings).length) {
    try {
      updateSetting(settings as Partial<LX.AppSetting>)
    } catch (err) {
      warnings.push(`设置 ${String((err as Error)?.message ?? err)}`)
      console.log('restore settings failed', err)
    }
  }

  for (const api of data.userApis ?? []) {
    try {
      if (api?.script) await addUserApi(api.script)
    } catch (err) {
      warnings.push(`音源 ${String((err as Error)?.message ?? err)}`)
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
    warnings,
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
