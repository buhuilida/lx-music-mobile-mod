import { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getNewAlbums, getSubAlbums } from '@/core/netease'
import { pushAlbumSongsScreen, pushPlatformSettingScreen } from '@/navigation'

interface WyAlbum {
  id: number
  name: string
  picUrl?: string
  artist?: { name?: string }
  artists?: Array<{ name?: string }>
  size?: number
  publishTime?: number
  company?: string
}

interface Props {
  componentId: string
  /** sub：我收藏的专辑；new：新碟上架 */
  mode?: 'sub' | 'new'
}

/**
 * 专辑网格（1.21.0）
 *
 * 收藏专辑和新碟上架共用一套版式，只换数据源和标题。
 */
export default memo(({ componentId, mode = 'sub' }: Props) => {
  const t = useI18n()
  const theme = useTheme()
  const [list, setList] = useState<WyAlbum[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isSub = mode == 'sub'

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseAlbums, componentId)
  }, [componentId])

  const refresh = useCallback(async() => {
    setLoading(true)
    setError('')
    try {
      const data = isSub ? await getSubAlbums() : await getNewAlbums(30, 0)
      setList(data as unknown as WyAlbum[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [isSub])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const renderItem = ({ item }: { item: WyAlbum }) => {
    const artist = item.artist?.name ?? item.artists?.map(a => a.name).filter(Boolean).join('、') ?? ''
    return (
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={() => {
          pushAlbumSongsScreen(componentId, item.id, item.name)
        }}
      >
        <Image url={item.picUrl} style={styles.cover} />
        <Text size={12} numberOfLines={2} style={styles.name}>{item.name}</Text>
        <Text size={10} color={theme['c-font-label']} numberOfLines={1} style={styles.artist}>{artist}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={`${isSub ? t('netease_sub_albums') : t('netease_new_albums')}${list.length ? ` (${list.length})` : ''}`}
      />
      {
        error
          ? <View style={styles.center}>
              <Icon name="album" size={42} color={theme['c-350']} />
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
              numColumns={2}
              keyExtractor={item => String(item.id)}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh() }} />}
              contentContainerStyle={list.length ? styles.listContent : styles.center}
              ListEmptyComponent={loading
                ? null
                : <View style={styles.center}>
                    <Icon name="album" size={42} color={theme['c-350']} />
                    <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>
                      {isSub ? t('netease_sub_albums_empty') : t('netease_new_albums_empty')}
                    </Text>
                  </View>}
            />
      }
    </PageContent>
  )
})

const styles = createStyle({
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
    paddingLeft: 6,
    paddingRight: 6,
  },
  item: {
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: '50%',
    paddingLeft: 6,
    paddingRight: 6,
    paddingBottom: 16,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
  },
  name: {
    marginTop: 8,
    lineHeight: 17,
  },
  artist: {
    marginTop: 3,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
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
