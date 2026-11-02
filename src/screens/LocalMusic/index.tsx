import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Loading from '@/components/common/Loading'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { playList } from '@/core/player/player'
import { createStyle, toast } from '@/utils/tools'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'
import { ensureLocalList, getLocalMusics, LOCAL_LIST_ID, scanAndSyncLocalList } from '@/core/localMusic'
import { usePlayMusicInfo } from '@/store/player/hook'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

/**
 * 本地音乐页面（1.17.1）
 *
 * 之前侧边栏「本地音乐」直接把 nav 切到歌单页，歌单不存在时就是一片空白（黑屏），
 * 现在改成独立的本地音乐页面：列表 + 扫描 + 播放全部，扫描不到也不会白屏。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const playMusicInfo = usePlayMusicInfo()
  const [list, setList] = useState<LX.List.ListMusics>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [inited, setInited] = useState(false)
  const scanningRef = useRef(false)

  const refresh = useCallback(() => {
    void getLocalMusics().then((musics) => {
      setList([...musics])
    }).catch(() => {}).finally(() => {
      setInited(true)
    })
  }, [])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.localMusic, componentId)
  }, [componentId])

  useEffect(() => {
    void ensureLocalList().then(refresh).catch(refresh)

    const handleChange = (ids: string[]) => {
      if (!ids.includes(LOCAL_LIST_ID)) return
      refresh()
    }
    global.app_event.on('myListMusicUpdate', handleChange)
    return () => {
      global.app_event.off('myListMusicUpdate', handleChange)
    }
  }, [refresh])

  const handleScan = () => {
    if (scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setProgress(0)
    void scanAndSyncLocalList(setProgress).then((count) => {
      toast(t('setting_local_music_done', { count }))
    }).catch((err: Error) => {
      toast(t('setting_local_music_failed', { msg: err?.message ?? '' }), 'long')
    }).finally(() => {
      scanningRef.current = false
      setScanning(false)
      refresh()
    })
  }

  const handlePlayAll = () => {
    if (!list.length) {
      toast(t('setting_local_music_empty'))
      return
    }
    void playList(LOCAL_LIST_ID, 0)
  }

  const handlePlay = (index: number) => {
    void playList(LOCAL_LIST_ID, index)
  }

  const renderItem = ({ item, index }: { item: LX.Music.MusicInfo, index: number }) => {
    const active = playMusicInfo.listId == LOCAL_LIST_ID && playMusicInfo.musicInfo?.id == item.id
    return (
      <TouchableOpacity style={styles.item} activeOpacity={0.6} onPress={() => { handlePlay(index) }}>
        <View style={styles.indexBox}>
          {
            active
              ? <Icon name="play-outline" size={13} color={theme['c-primary-font']} />
              : <Text size={12} color={theme['c-300']}>{index + 1}</Text>
          }
        </View>
        <View style={styles.itemContent}>
          <Text numberOfLines={1} size={14} color={active ? theme['c-primary-font'] : undefined}>{item.name}</Text>
          <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.itemSub}>
            {`${item.singer || t('setting_local_music_unknown_singer')}${item.source == 'local' ? ` · ${(item.meta).ext?.toUpperCase() ?? ''}` : ''}`}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.headerBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>
            {`${t('setting_local_music')}${list.length ? ` (${list.length})` : ''}`}
          </Text>
          <TouchableOpacity onPress={handlePlayAll} style={styles.headerBtn} disabled={!list.length}>
            <Icon name="play-outline" size={18} color={list.length ? undefined : theme['c-350']} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleScan} style={styles.scanHeaderBtn} disabled={scanning}>
            {
              scanning
                ? <Loading color={theme['c-font']} size={16} />
                : <Text size={13} color={theme['c-primary-font']}>{t('setting_local_music_scan_short')}</Text>
            }
          </TouchableOpacity>
        </View>
        {
          scanning
            ? <Text size={11} color={theme['c-font-label']} style={styles.scanTip}>
                {t('setting_local_music_scanning_progress', { count: progress })}
              </Text>
            : null
        }
      </View>
      <FlatList
        style={styles.list}
        data={list}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={list.length ? styles.listContent : styles.listContentEmpty}
        ListEmptyComponent={inited
          ? <View style={styles.empty}>
              <Icon name="music_time" size={42} color={theme['c-350']} />
              <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{t('setting_local_music_empty_tip')}</Text>
              <TouchableOpacity style={[styles.scanBtn, { backgroundColor: theme['c-primary-background'] }]} onPress={handleScan} activeOpacity={0.7}>
                <Text size={13} color={theme['c-primary-font']}>{t('setting_local_music_scan')}</Text>
              </TouchableOpacity>
            </View>
          : null}
      />
    </PageContent>
  )
})

const styles = createStyle({
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  },
  headerBtn: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanHeaderBtn: {
    minWidth: 48,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
    paddingRight: 6,
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  scanTip: {
    paddingLeft: 16,
    paddingBottom: 6,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  indexBox: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 16,
  },
  itemSub: {
    marginTop: 3,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyText: {
    marginTop: 12,
    marginBottom: 16,
    paddingLeft: 30,
    paddingRight: 30,
    lineHeight: 18,
    textAlign: 'center',
  },
  scanBtn: {
    paddingLeft: 22,
    paddingRight: 22,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
  },
})
