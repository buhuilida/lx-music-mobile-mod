import { memo, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import { downloadMusic, getBestQuality } from '@/core/download'
import { pushPlatformSettingScreen } from '@/navigation'
import { usePlayMusicInfo } from '@/store/player/hook'
import { createStyle, toast } from '@/utils/tools'

interface Props {
  componentId: string
  title: string
  /** 临时播放列表标识，不同页面用不同 key，切换页面不会互相覆盖 */
  listKey: string
  loader: () => Promise<LX.Music.MusicInfoOnline[]>
  subtitle?: string
  emptyTip?: string
  /** 未登录时的提示（传了就显示去登录按钮） */
  requireLogin?: boolean
  /** 列表上方额外内容 */
  header?: ReactNode
}

/**
 * 通用在线歌曲列表（每日推荐 / 云盘 / 喜欢的音乐 / 歌手歌曲共用）
 */
export default memo(({ componentId, title, listKey, loader, subtitle, emptyTip, requireLogin, header }: Props) => {
  const t = useI18n()
  const theme = useTheme()
  const playMusicInfo = usePlayMusicInfo()
  const [list, setList] = useState<LX.Music.MusicInfoOnline[]>([])
  const [loading, setLoading] = useState(false)
  const [inited, setInited] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async(showLoading = true) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      const next = await loader()
      setList(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setInited(true)
    }
  }, [loader])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handlePlayAll = () => {
    if (!list.length) {
      toast(emptyTip ?? t('online_empty'))
      return
    }
    void setTempList(listKey, list).then(async() => playList(LIST_IDS.TEMP, 0))
  }

  const handlePlay = (index: number) => {
    void setTempList(listKey, list).then(async() => playList(LIST_IDS.TEMP, index))
  }

  const handleDownload = (item: LX.Music.MusicInfoOnline) => {
    void downloadMusic(item, getBestQuality(item)).then((ok) => {
      if (ok) toast(t('online_download_started'))
    }).catch((err: Error) => {
      toast(t('online_download_failed', { msg: err?.message ?? '' }), 'long')
    })
  }

  const renderItem = ({ item, index }: { item: LX.Music.MusicInfoOnline, index: number }) => {
    const active = playMusicInfo.musicInfo?.id == item.id
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
            {item.singer || t('setting_local_music_unknown_singer')}
          </Text>
        </View>
        <TouchableOpacity style={styles.downloadBtn} onPress={() => { handleDownload(item) }} activeOpacity={0.6}>
          <Icon name="download-2" size={16} color={theme['c-350']} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={`${title}${list.length ? ` (${list.length})` : ''}`}
        subtitle={subtitle}
        right={
          <TouchableOpacity onPress={handlePlayAll} style={styles.headerBtn} disabled={!list.length}>
            <Icon name="play-outline" size={18} color={list.length ? undefined : theme['c-350']} />
          </TouchableOpacity>
        }
      />
      {
        loading && !inited
          ? <View style={styles.center}><ActivityIndicator color={theme['c-primary-font']} /></View>
          : error
            ? <ScrollView
                contentContainerStyle={styles.center}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh() }} />}
              >
                <Icon name="music_time" size={42} color={theme['c-350']} />
                <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{error}</Text>
                {requireLogin
                  ? <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: theme['c-primary-background'] }]}
                      onPress={() => { pushPlatformSettingScreen(componentId) }}
                      activeOpacity={0.7}
                    >
                      <Text size={13} color={theme['c-primary-font']}>{t('online_go_login')}</Text>
                    </TouchableOpacity>
                  : <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: theme['c-primary-background'] }]}
                      onPress={() => { void refresh() }}
                      activeOpacity={0.7}
                    >
                      <Text size={13} color={theme['c-primary-font']}>{t('online_retry')}</Text>
                    </TouchableOpacity>
                }
              </ScrollView>
            : <FlatList
                style={styles.list}
                data={list}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                ListHeaderComponent={<>{header}</>}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh() }} />}
                contentContainerStyle={list.length ? styles.listContent : styles.listContentEmpty}
                ListEmptyComponent={inited
                  ? <View style={styles.center}>
                      <Icon name="music_time" size={42} color={theme['c-350']} />
                      <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>
                        {requireLogin ? t('online_login_required') : (emptyTip ?? t('online_empty'))}
                      </Text>
                      {requireLogin
                        ? <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: theme['c-primary-background'] }]}
                            onPress={() => { pushPlatformSettingScreen(componentId) }}
                            activeOpacity={0.7}
                          >
                            <Text size={13} color={theme['c-primary-font']}>{t('online_go_login')}</Text>
                          </TouchableOpacity>
                        : null}
                    </View>
                  : null}
              />
      }
    </PageContent>
  )
})

const styles = createStyle({
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingRight: 8,
  },
  itemSub: {
    marginTop: 3,
  },
  downloadBtn: {
    width: 42,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
