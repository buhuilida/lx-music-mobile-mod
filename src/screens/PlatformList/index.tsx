import { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { COMPONENT_IDS, LIST_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { getQQFavAlbums, getQQFavPlaylists, getQQMyPlaylists, getQQPlaylistSongs } from '@/core/qq'
import { getKgMyPlaylists, getKgPlaylistSongs } from '@/core/kugou'
import { friendlyError } from '@/utils/errorMsg'

/**
 * 平台歌单 / 专辑列表（1.22.0）
 *
 * QQ 音乐、酷狗的「我的歌单 / 收藏歌单 / 收藏专辑」都进这个页面，
 * 点一行就把该歌单的歌曲塞进临时列表播放。
 */

export type PlatformListMode = 'tx-mine' | 'tx-fav' | 'tx-album' | 'kg-mine'

interface Item {
  id: string
  name: string
  cover?: string
  desc?: string
  count?: number
  /** 专辑要走另一套取歌接口，这里先标记出来 */
  kind: 'playlist' | 'album'
}

export default memo(({ componentId, mode }: { componentId: string, mode: PlatformListMode }) => {
  const t = useI18n()
  const theme = useTheme()
  const [list, setList] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState('')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseMine, componentId)
  }, [componentId])

  const load = useCallback(async() => {
    setLoading(true)
    try {
      if (mode == 'tx-mine') {
        const data = await getQQMyPlaylists()
        setList((data as any[]).map((item: any) => ({ id: String(item.tid), name: item.name, cover: item.cover, desc: item.desc, count: item.songCount, kind: 'playlist' })))
      } else if (mode == 'tx-fav') {
        const data = await getQQFavPlaylists()
        setList((data as any[]).map((item: any) => ({ id: String(item.tid), name: item.name, cover: item.cover, desc: item.creator, count: item.songCount, kind: 'playlist' })))
      } else if (mode == 'tx-album') {
        const data = await getQQFavAlbums()
        setList((data as any[]).map((item: any) => ({ id: String(item.mid), name: item.name, cover: item.cover, desc: item.singer, count: item.songCount, kind: 'album' })))
      } else {
        const data = await getKgMyPlaylists()
        setList((data as any[]).map((item: any) => ({ id: String(item.id), name: item.name, cover: item.cover, desc: item.desc, count: item.songCount, kind: 'playlist' })))
      }
    } catch (err) {
      toast(friendlyError(err), 'long')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { void load() }, [load])

  const handlePlay = useCallback(async(item: Item) => {
    if (item.kind == 'album') {
      toast(t('netease_album_play_tip'), 'long')
      return
    }
    setPlaying(item.id)
    try {
      const songs = mode == 'kg-mine'
        ? await getKgPlaylistSongs(item.id)
        : await getQQPlaylistSongs(item.id)
      if (!songs.length) {
        toast(t('netease_empty_list'))
        return
      }
      await setTempList(LIST_IDS.TEMP, songs)
      await playList(LIST_IDS.TEMP, 0)
    } catch (err) {
      toast(friendlyError(err), 'long')
    } finally {
      setPlaying('')
    }
  }, [mode, t])

  const title = mode == 'tx-mine'
    ? t('qq_my_playlists')
    : mode == 'tx-fav'
      ? t('qq_fav_playlists')
      : mode == 'tx-album'
        ? t('qq_fav_albums')
        : t('kg_my_playlists')

  return (
    <PageContent>
      <FullScreenHeader componentId={componentId} title={`${title}${list.length ? ` (${list.length})` : ''}`} />
      {
        loading
          ? <View style={styles.center}><ActivityIndicator color={theme['c-primary-font']} /></View>
          : list.length
            ? <FlatList
                data={list}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { void handlePlay(item) }}
                    style={[styles.row, { backgroundColor: theme['c-content-background'] }]}
                  >
                    {
                      item.cover
                        ? <Image url={item.cover} style={styles.cover} />
                        : <View style={[styles.cover, styles.coverEmpty, { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}>
                            <Icon name="album" size={16} color={theme['c-primary-font']} />
                          </View>
                    }
                    <View style={styles.info}>
                      <Text size={13} numberOfLines={1}>{item.name}</Text>
                      <Text size={10} color={theme['c-font-label']} numberOfLines={1} style={styles.sub}>
                        {[item.desc, item.count ? `${item.count} 首` : ''].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {playing == item.id
                      ? <ActivityIndicator size="small" color={theme['c-primary-font']} />
                      : <Icon name="play-outline" size={17} color={theme['c-350']} />}
                  </TouchableOpacity>
                )}
              />
            : <View style={styles.center}>
                <Text size={13} color={theme['c-font-label']}>{t('netease_empty_list')}</Text>
              </View>
      }
    </PageContent>
  )
})

const styles = createStyle({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  listContent: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  coverEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
    paddingRight: 8,
  },
  sub: {
    marginTop: 4,
  },
})
