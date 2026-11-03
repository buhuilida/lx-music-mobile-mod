import { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getMyPlaylists, getSubscribedPlaylists } from '@/core/netease'
import { pushPlatformSettingScreen, pushSonglistDetailScreen } from '@/navigation'

interface WyPlaylist {
  id: number
  name: string
  coverImgUrl?: string
  picUrl?: string
  trackCount?: number
  playCount?: number
  subscribed?: boolean
  creator?: { nickname?: string }
}

const extractWyToken = (cookie: string) => {
  const match = /(?:^|;\s*)MUSIC_U=([^;]+)/.exec(cookie)
  return match?.[1] ?? ''
}

/**
 * 我的歌单 / 收藏歌单（1.20.0，1.21.0 拆出「只看收藏」）
 *
 * onlySubscribed 为 true 时只显示收藏别人的歌单，标题也跟着变。
 */
export default memo(({ componentId, onlySubscribed = false }: { componentId: string, onlySubscribed?: boolean }) => {
  const t = useI18n()
  const theme = useTheme()
  const cookie = useSettingValue('platform.wyCookie')
  const [list, setList] = useState<WyPlaylist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteasePlaylists, componentId)
  }, [componentId])

  const refresh = useCallback(async() => {
    setLoading(true)
    setError('')
    try {
      const data = onlySubscribed
        ? await getSubscribedPlaylists() as unknown as WyPlaylist[]
        : await getMyPlaylists() as unknown as WyPlaylist[]
      setList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [onlySubscribed])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const renderItem = ({ item }: { item: WyPlaylist }) => {
    const token = extractWyToken(cookie)
    return (
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={() => {
          pushSonglistDetailScreen(componentId, {
            // 私密歌单需要带上 MUSIC_U，songList 会拆出 token 作为 Cookie
            id: token ? `${item.id}###${token}` : String(item.id),
            name: item.name,
            img: item.coverImgUrl ?? item.picUrl ?? '',
            source: 'wy',
            author: item.creator?.nickname ?? '',
            total: item.trackCount ? String(item.trackCount) : '',
          })
        }}
      >
        <Image url={item.coverImgUrl ?? item.picUrl} style={styles.cover} />
        <View style={styles.content}>
          <Text size={14} numberOfLines={2}>{item.name}</Text>
          <Text size={11} color={theme['c-font-label']} style={styles.sub} numberOfLines={1}>
            {`${item.trackCount ?? 0} ${t('netease_song_unit')}${item.subscribed ? ` · ${t('netease_subscribed')}` : ''}`}
          </Text>
        </View>
        <Icon name="chevron-right" size={14} color={theme['c-350']} />
      </TouchableOpacity>
    )
  }

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={`${onlySubscribed ? t('netease_sub_playlists') : t('netease_my_playlists')}${list.length ? ` (${list.length})` : ''}`}
      />
      {
        error
          ? <View style={styles.center}>
              <Icon name="list-order" size={42} color={theme['c-350']} />
              <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{error}</Text>
              {/* 已登录时接口报错也会走到这里，主操作必须是「重试」 */}
              <View style={styles.errorActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme['c-primary-background'] }]}
                  onPress={() => { void refresh() }}
                  activeOpacity={0.7}
                >
                  <Text size={13} color={theme['c-primary-font']}>{t('online_retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.reloginBtn, { borderColor: theme['c-border-background'] }]}
                  onPress={() => { pushPlatformSettingScreen(componentId) }}
                  activeOpacity={0.7}
                >
                  <Text size={13} color={theme['c-font-label']}>{t('online_relogin')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          : <FlatList
              data={list}
              keyExtractor={item => String(item.id)}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh() }} />}
              contentContainerStyle={list.length ? styles.listContent : styles.center}
              ListEmptyComponent={loading
                ? null
                : <View style={styles.center}>
                    <Icon name="list-order" size={42} color={theme['c-350']} />
                    <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>
                      {onlySubscribed ? t('netease_sub_playlists_empty') : t('netease_my_playlists_empty')}
                    </Text>
                  </View>}
            />
      }
    </PageContent>
  )
})

const styles = createStyle({
  listContent: {
    paddingTop: 6,
    paddingBottom: 24,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 12,
    paddingRight: 8,
  },
  sub: {
    marginTop: 4,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    paddingTop: 40,
  },
  emptyText: {
    marginTop: 12,
    marginBottom: 16,
    paddingLeft: 30,
    paddingRight: 30,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionBtn: {
    paddingLeft: 22,
    paddingRight: 22,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reloginBtn: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
})
