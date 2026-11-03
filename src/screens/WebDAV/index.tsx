import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Loading from '@/components/common/Loading'
import { setComponentId } from '@/core/common'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast, confirmDialog } from '@/utils/tools'
import { COMPONENT_IDS, LIST_IDS } from '@/config/constant'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import {
  getWebDAVStore,
  isWebDAVConfigured,
  listWebDAVFolders,
  listWebDAVSongs,
  scanWebDAVSongs,
  clearWebDAVSongs,
  toLocalMusicInfo,
  type WebDAVFolder,
  type WebDAVSong,
} from '@/core/webdavMusic'

const formatSize = (size: number) => {
  if (!size) return ''
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(size / 1024)} KB`
}

/**
 * WebDAV 云盘（1.23.0）
 *
 * 浏览网盘目录、扫描音频、直接播放。与「数据同步 → WebDAV 备份」共用服务器配置。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const [path, setPath] = useState('/')
  const [folders, setFolders] = useState<WebDAVFolder[]>([])
  const [songs, setSongs] = useState<WebDAVSong[]>([])
  const [scanned, setScanned] = useState<WebDAVSong[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.webdav, componentId)
  }, [componentId])

  const loadStore = useCallback(() => {
    void getWebDAVStore().then(store => { setScanned(store.songs) })
  }, [])

  const load = useCallback((target: string) => {
    setLoading(true)
    setError(null)
    void Promise.all([listWebDAVFolders(target), listWebDAVSongs(target)])
      .then(([folderList, songList]) => {
        setFolders(folderList)
        setSongs(songList)
        setPath(target)
      })
      .catch((err: Error) => {
        const message = err?.message ?? ''
        setError(
          message == 'WEBDAV_NOT_CONFIGURED' ? t('webdav_not_configured')
            : message == 'WEBDAV_AUTH_FAILED' ? t('webdav_auth_failed')
              : message == 'WEBDAV_TIMEOUT' ? t('webdav_timeout')
                : `${t('webdav_load_failed')}: ${message}`,
        )
        setFolders([])
        setSongs([])
      })
      .finally(() => { setLoading(false) })
  }, [t])

  useEffect(() => {
    if (!isWebDAVConfigured()) {
      setLoading(false)
      setError(t('webdav_not_configured'))
      return
    }
    load('/')
    loadStore()
  }, [load, loadStore, t])

  const playSongs = useCallback((list: WebDAVSong[], index = 0) => {
    if (!list.length) return
    void (async() => {
      await setTempList(LIST_IDS.TEMP, list.map(toLocalMusicInfo))
      await playList(LIST_IDS.TEMP, index)
    })().catch((err) => {
      toast(`${t('webdav_play_failed')}: ${(err as Error).message}`, 'long')
    })
  }, [])

  const handleScan = useCallback(() => {
    if (scanning) return
    setScanning(true)
    toast(t('webdav_scanning'), 'short')
    void scanWebDAVSongs(path, (count) => {
      if (count % 50 == 0) toast(t('webdav_scan_progress', { count }), 'short')
    }).then((store) => {
      setScanned(store.songs)
      toast(t('webdav_scan_done', { count: store.songs.length }), 'long')
    }).catch((err: Error) => {
      toast(`${t('webdav_scan_failed')}: ${err?.message ?? ''}`, 'long')
    }).finally(() => { setScanning(false) })
  }, [path, scanning, t])

  const handleClear = useCallback(() => {
    void confirmDialog({ message: t('webdav_clear_confirm'), bgClose: false }).then(async(ok) => {
      if (!ok) return
      await clearWebDAVSongs()
      setScanned([])
      toast(t('webdav_clear_done'))
    })
  }, [t])

  const parentPath = useMemo(() => {
    if (path == '/' || !path) return null
    return path.slice(0, path.lastIndexOf('/')) || '/'
  }, [path])

  const crumbs = useMemo(() => path.split('/').filter(Boolean), [path])

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={t('webdav_title')}
        subtitle={path}
        right={
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleScan} activeOpacity={0.6}>
              <Icon name="search-2" size={19} color={scanning ? theme['c-350'] : theme['c-font']} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={() => { load(path) }} activeOpacity={0.6}>
              <Icon name="list-loop" size={19} color={theme['c-font']} />
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {scanned.length
          ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text size={13} color={theme['c-font-label']}>{t('webdav_scanned', { count: scanned.length })}</Text>
                  <View style={styles.sectionActions}>
                    <TouchableOpacity onPress={() => { playSongs(scanned) }} activeOpacity={0.6} style={styles.textBtn}>
                      <Text size={12} color={theme['c-primary-font']}>{t('webdav_play_all')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClear} activeOpacity={0.6} style={styles.textBtn}>
                      <Text size={12} color={theme['c-450']}>{t('webdav_clear')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          : null}

        {loading
          ? <View style={styles.center}><Loading color={theme['c-font']} /></View>
          : error
            ? <View style={styles.center}>
                <Text size={13} color={theme['c-font-label']} style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme['c-button-background'] }]} onPress={() => { load(path) }} activeOpacity={0.7}>
                  <Text size={12} color={theme['c-button-font']}>{t('webdav_retry')}</Text>
                </TouchableOpacity>
              </View>
            : (
                <>
                  {crumbs.length
                    ? (
                        <View style={styles.crumbs}>
                          <TouchableOpacity onPress={() => { load('/') }} activeOpacity={0.6} style={styles.crumb}>
                            <Text size={12} color={theme['c-primary-font']}>{t('webdav_root')}</Text>
                          </TouchableOpacity>
                          {crumbs.map((item, index) => (
                            <View key={`${item}_${index}`} style={styles.crumbWrap}>
                              <Text size={12} color={theme['c-350']}>/</Text>
                              <Text size={12} color={index == crumbs.length - 1 ? theme['c-font'] : theme['c-primary-font']} numberOfLines={1}>
                                {item}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )
                    : null}

                  {parentPath
                    ? (
                        <TouchableOpacity style={styles.row} onPress={() => { load(parentPath) }} activeOpacity={0.6}>
                          <Icon name="chevron-left" size={17} color={theme['c-font-label']} />
                          <Text size={14} color={theme['c-font-label']} style={styles.rowText}>{t('webdav_parent')}</Text>
                        </TouchableOpacity>
                      )
                    : null}

                  {folders.map(folder => (
                    <TouchableOpacity key={folder.path} style={styles.row} onPress={() => { load(folder.path) }} activeOpacity={0.6}>
                      <Icon name="add_folder" size={18} color={theme['c-primary-font']} />
                      <Text size={14} style={styles.rowText} numberOfLines={1}>{folder.name}</Text>
                      <Icon name="chevron-right" size={15} color={theme['c-350']} />
                    </TouchableOpacity>
                  ))}

                  {songs.map((song, index) => (
                    <TouchableOpacity key={song.id} style={styles.row} onPress={() => { playSongs(songs, index) }} activeOpacity={0.6}>
                      <Icon name="music_time" size={17} color={theme['c-450']} />
                      <View style={styles.songText}>
                        <Text size={14} numberOfLines={1}>{song.name}</Text>
                        {song.singer
                          ? <Text size={11} color={theme['c-font-label']} numberOfLines={1}>{song.singer}</Text>
                          : null}
                      </View>
                      <Text size={11} color={theme['c-350']}>{formatSize(song.size)}</Text>
                    </TouchableOpacity>
                  ))}

                  {!folders.length && !songs.length
                    ? (
                        <View style={styles.center}>
                          <Text size={13} color={theme['c-font-label']}>{t('webdav_empty')}</Text>
                          <Text size={11} color={theme['c-350']} style={styles.emptyTip}>{t('webdav_empty_tip')}</Text>
                        </View>
                      )
                    : null}
                </>
              )}
      </ScrollView>
    </PageContent>
  )
})

const styles = createStyle({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textBtn: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  crumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 2,
  },
  crumb: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  crumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 11,
    paddingBottom: 11,
    gap: 10,
  },
  rowText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  songText: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingLeft: 30,
    paddingRight: 30,
  },
  errorText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    marginTop: 14,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
  },
  emptyTip: {
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 16,
  },
})
