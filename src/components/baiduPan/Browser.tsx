import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import Input, { type InputType } from '@/components/common/Input'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { confirmDialog, createStyle, tipDialog, toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import {
  createDir,
  deleteFiles,
  errnoToText,
  listDir,
  BaiduPanError,
  type PanFile,
  type PanSortField,
} from '@/core/baiduPan/api'
import { consumeDirSelection } from '@/core/baiduPan/selection'
import { parseFavorites, serializeFavorites } from '@/core/baiduPan/favorites'

const formatSize = (size: number) => {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const formatTime = (seconds: number) => {
  if (!seconds) return ''
  const d = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const parentOf = (path: string) => {
  if (!path || path === '/') return '/'
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

/**
 * 百度网盘目录浏览（无头部，供首页视图和「选目录」页共用）
 *
 * - 默认展示文件，按时间从新到旧
 * - 支持名称搜索、切换排序、删除文件
 * - pickMode 下多一个「确认」按钮，用于选择保存目录
 */
export default memo(({ pickMode = false, onFinish }: { pickMode?: boolean, onFinish?: () => void }) => {
  const t = useI18n()
  const theme = useTheme()
  const alertRef = useRef<ConfirmAlertType>(null)
  const nameInputRef = useRef<InputType>(null)
  const favorites = parseFavorites(useSettingValue('download.baiduPanFavorites'))
  const [currentPath, setCurrentPath] = useState('/')
  const [dirs, setDirs] = useState<PanFile[]>([])
  const [files, setFiles] = useState<PanFile[]>([])
  const [showFiles, setShowFiles] = useState(true)
  // 默认「时间最新」，找刚上传的歌最顺手
  const [sortField, setSortField] = useState<PanSortField>('time')
  const [sortDesc, setSortDesc] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [errorText, setErrorText] = useState('')

  const load = useCallback(async(dir: string, field: PanSortField, desc: boolean) => {
    setErrorText('')
    try {
      const list = await listDir(dir, field, desc ? 1 : 0)
      setDirs(list.filter((item) => item.isdir))
      setFiles(list.filter((item) => !item.isdir))
    } catch (err: any) {
      const code = err instanceof BaiduPanError ? err.code : -1
      setDirs([])
      setFiles([])
      setErrorText(code === -6 ? t('baidu_pan_err_not_login') : errnoToText(code))
      console.log('[百度网盘] 列目录失败:', err?.message ?? err)
    }
  }, [t])

  useEffect(() => {
    setLoading(true)
    void load(currentPath, sortField, sortDesc).finally(() => setLoading(false))
  }, [currentPath, sortField, sortDesc, load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void load(currentPath, sortField, sortDesc).finally(() => setRefreshing(false))
  }, [currentPath, sortField, sortDesc, load])

  const isFavorite = favorites.includes(currentPath)

  const toggleFavorite = useCallback(() => {
    const next = isFavorite
      ? favorites.filter((path) => path != currentPath)
      : [...favorites, currentPath]
    updateSetting({ 'download.baiduPanFavorites': serializeFavorites(next) })
    toast(isFavorite ? t('baidu_pan_favorite_removed') : t('baidu_pan_favorite_added'))
  }, [currentPath, favorites, isFavorite, t])

  const handleConfirm = useCallback(() => {
    // 被播放页调起来的场景：把路径回传，不改默认设置
    if (consumeDirSelection(currentPath)) {
      onFinish?.()
      return
    }
    updateSetting({
      'download.baiduPanDir': currentPath,
      'download.saveTarget': 'baiduPan',
    })
    toast(`${currentPath} · ${t('setting_download_save_target_baidu')}`)
    onFinish?.()
  }, [currentPath, onFinish, t])

  const handleCreate = useCallback(async() => {
    const name = newName.trim()
    if (!name) {
      nameInputRef.current?.focus()
      return
    }
    setCreating(true)
    try {
      const path = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      await createDir(path)
      toast(t('baidu_pan_dir_created'))
      alertRef.current?.setVisible(false)
      setNewName('')
      await load(currentPath, sortField, sortDesc)
    } catch (err: any) {
      const code = err instanceof BaiduPanError ? err.code : -1
      await tipDialog({ message: errnoToText(code) })
    } finally {
      setCreating(false)
    }
  }, [currentPath, load, newName, t, sortField, sortDesc])

  const handleDelete = useCallback(async(item: PanFile) => {
    const ok = await confirmDialog({
      message: t('baidu_pan_delete_confirm', { name: item.name }),
      confirmButtonText: t('baidu_pan_delete'),
    })
    if (!ok) return
    try {
      await deleteFiles([item.path])
      setFiles((prev) => prev.filter((row) => row.fs_id != item.fs_id))
      toast(t('baidu_pan_delete_success'))
    } catch (err: any) {
      const code = err instanceof BaiduPanError ? err.code : -1
      await tipDialog({ message: errnoToText(code) })
    }
  }, [t])

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const match = (item: PanFile) => !kw || item.name.toLowerCase().includes(kw)
    const dirList = dirs.filter(match)
    const fileList = showFiles ? files.filter(match) : []
    return [...dirList, ...fileList]
  }, [dirs, files, keyword, showFiles])

  return (
    <View style={styles.container}>
      <View style={styles.pathBar}>
        <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.pathText}>{currentPath}</Text>
        <TouchableOpacity onPress={toggleFavorite} style={styles.toggleBtn}>
          <Text size={12} color={theme['c-primary']}>{isFavorite ? '★' : '☆'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setNewName('')
            alertRef.current?.setVisible(true)
            setTimeout(() => nameInputRef.current?.focus(), 150)
          }}
          style={styles.toggleBtn}
        >
          <Icon name="add_folder" size={16} />
        </TouchableOpacity>
        {pickMode
          ? (
            <TouchableOpacity onPress={handleConfirm} style={{ ...styles.confirmBtn, backgroundColor: theme['c-primary'] }}>
              <Text size={12} color={theme['c-primary-font']}>{t('baidu_pan_dir_confirm')}</Text>
            </TouchableOpacity>
            )
          : null}
      </View>

      <View style={styles.toolbar}>
        <Input
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('baidu_pan_search_placeholder')}
          placeholderTextColor={theme['c-font-label']}
          style={{ ...styles.searchInput, color: theme['c-font'], borderColor: theme['c-400'] }}
        />
        <TouchableOpacity
          onPress={() => setSortField(sortField === 'name' ? 'time' : 'name')}
          style={styles.toolBtn}
        >
          <Text size={12} color={theme['c-primary']}>
            {sortField === 'name' ? t('baidu_pan_sort_name') : t('baidu_pan_sort_time')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSortDesc((prev) => !prev)} style={styles.toolBtn}>
          <Text size={12} color={theme['c-primary']}>{sortDesc ? '↓' : '↑'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFiles((prev) => !prev)} style={styles.toolBtn}>
          <Text size={12} color={theme['c-primary']}>
            {showFiles ? t('baidu_pan_dir_only_folders') : t('baidu_pan_dir_show_files')}
          </Text>
        </TouchableOpacity>
      </View>

      {currentPath !== '/'
        ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setCurrentPath(parentOf(currentPath))} style={styles.item}>
            <Text numberOfLines={1} size={13} color={theme['c-font-label']} style={styles.itemName}>..</Text>
          </TouchableOpacity>
          )
        : null}

      {loading
        ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme['c-primary']} />
          </View>
          )
        : (
          <FlatList
            style={styles.list}
            data={visible}
            keyExtractor={(item) => String(item.fs_id)}
            renderItem={({ item }) => (
              item.isdir
                ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setCurrentPath(item.path)} style={styles.item}>
                    <Text numberOfLines={1} size={14} style={styles.itemName}>{item.name}</Text>
                    <Icon name="chevron-right" size={14} color={theme['c-font-label']} />
                  </TouchableOpacity>
                  )
                : (
                  <View style={styles.item}>
                    <View style={styles.fileInfo}>
                      <Text numberOfLines={1} size={13} color={theme['c-font']}>{item.name}</Text>
                      <Text size={11} color={theme['c-font-label']} style={styles.fileMeta}>
                        {`${formatSize(item.size)}${item.server_mtime ? ` · ${formatTime(item.server_mtime)}` : ''}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { void handleDelete(item) }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text size={12} color={theme['c-primary']}>{t('baidu_pan_delete')}</Text>
                    </TouchableOpacity>
                  </View>
                  )
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme['c-primary']} />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text size={13} color={theme['c-font-label']}>{errorText || t('baidu_pan_dir_empty')}</Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
          )}

      <ConfirmAlert
        ref={alertRef}
        onConfirm={() => { void handleCreate() }}
        title={t('baidu_pan_dir_new')}
        cancelText={t('download_cancel')}
        confirmText={t('baidu_pan_dir_confirm')}
        disabledConfirm={creating}
      >
        <Input
          ref={nameInputRef}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('baidu_pan_dir_new_placeholder')}
          placeholderTextColor={theme['c-font-label']}
          style={{ ...styles.input, color: theme['c-font'], borderColor: theme['c-400'] }}
        />
      </ConfirmAlert>
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  pathText: {
    flex: 1,
    marginRight: 8,
  },
  toggleBtn: {
    paddingLeft: 6,
    paddingRight: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  confirmBtn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingBottom: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    marginRight: 8,
  },
  toolBtn: {
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  itemName: {
    flex: 1,
    marginRight: 8,
  },
  fileInfo: {
    flex: 1,
    marginRight: 10,
  },
  fileMeta: {
    marginTop: 2,
  },
  center: {
    paddingTop: 40,
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingLeft: 8,
    paddingRight: 8,
  },
})
