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
import { getFollowedArtists } from '@/core/netease'
import type { WyArtist } from '@/store/netease/state'
import { pushArtistSongsScreen, pushPlatformSettingScreen } from '@/navigation'

/** 关注的歌手（1.20.0） */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const [list, setList] = useState<WyArtist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseFollowed, componentId)
  }, [componentId])

  const refresh = useCallback(async() => {
    setLoading(true)
    setError('')
    try {
      setList(await getFollowedArtists())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const renderItem = ({ item }: { item: WyArtist }) => {
    return (
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={() => {
          pushArtistSongsScreen(componentId, item.id, item.name)
        }}
      >
        <Image url={item.picUrl ?? item.img1v1Url} style={styles.avatar} />
        <Text size={12} numberOfLines={1} style={styles.name}>{item.name}</Text>
        {item.albumSize ? <Text size={10} color={theme['c-font-label']} numberOfLines={1}>{t('netease_album_count', { count: item.albumSize })}</Text> : null}
      </TouchableOpacity>
    )
  }

  return (
    <PageContent>
      <FullScreenHeader componentId={componentId} title={`${t('netease_followed')}${list.length ? ` (${list.length})` : ''}`} />
      {
        error
          ? <View style={styles.center}>
              <Icon name="album" size={42} color={theme['c-350']} />
              <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{error}</Text>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme['c-primary-background'] }]}
                onPress={() => { pushPlatformSettingScreen(componentId) }}
                activeOpacity={0.7}
              >
                <Text size={13} color={theme['c-primary-font']}>{t('online_go_login')}</Text>
              </TouchableOpacity>
            </View>
          : <FlatList
              data={list}
              numColumns={3}
              keyExtractor={item => String(item.id)}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh() }} />}
              contentContainerStyle={list.length ? styles.listContent : styles.center}
              ListEmptyComponent={loading
                ? null
                : <View style={styles.center}>
                    <Icon name="album" size={42} color={theme['c-350']} />
                    <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{t('netease_followed_empty')}</Text>
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
  },
  item: {
    width: '33.33%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 6,
    paddingRight: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  name: {
    marginTop: 8,
    textAlign: 'center',
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
})
