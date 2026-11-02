import { memo, useCallback, useMemo } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useDownloadList } from '@/store/download/hook'
import { useI18n } from '@/lang'
import { buildLocalMusicInfo, formatSize, removeDownload } from '@/core/download'
import { playMusicInfo } from '@/core/player/player'
import { confirmDialog, createStyle, toast } from '@/utils/tools'

const Item = memo(({ item, playing, onPlay, onDelete }: {
  item: LX.Download.ExtItem
  playing: boolean
  onPlay: (item: LX.Download.ExtItem) => void
  onDelete: (item: LX.Download.ExtItem) => void
}) => {
  const theme = useTheme()
  return (
    <TouchableOpacity style={styles.item} activeOpacity={0.6} onPress={() => { onPlay(item) }}>
      <View style={styles.itemContent}>
        <Text numberOfLines={1} size={14} color={playing ? theme['c-primary-font'] : undefined}>
          {item.musicInfo.name}
        </Text>
        <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.itemSub}>
          {`${item.musicInfo.singer} · ${item.quality} · ${formatSize(item.size)}`}
        </Text>
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => { onDelete(item) }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="close" size={14} color={theme['c-font-label']} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const list = useDownloadList()

  const totalSize = useMemo(() => list.reduce((sum, item) => sum + item.size, 0), [list])

  const play = useCallback((item: LX.Download.ExtItem) => {
    void playMusicInfo(buildLocalMusicInfo(item)).then(() => {
      toast(t('download_play_tip'))
    }).catch(() => {
      toast(t('download_play_failed'))
    })
  }, [t])

  const playAll = useCallback(() => {
    if (!list.length) return
    play(list[0])
  }, [list, play])

  const handleDelete = useCallback((item: LX.Download.ExtItem) => {
    void confirmDialog({
      message: t('download_delete_tip'),
      confirmButtonText: t('download_delete'),
    }).then((confirm) => {
      if (!confirm) return
      void removeDownload(item.id)
    })
  }, [t])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text numberOfLines={1} size={18}>{t('download_title')}</Text>
          <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.headerSub}>
            {list.length ? `${list.length} 首 · ${formatSize(totalSize)}` : t('download_empty')}
          </Text>
        </View>
        {list.length
          ? <TouchableOpacity style={styles.playAllBtn} onPress={playAll} activeOpacity={0.6}>
              <Icon name="play" size={14} color={theme['c-primary-font']} />
              <Text size={12} color={theme['c-primary-font']} style={styles.playAllText}>{t('download_play_all')}</Text>
            </TouchableOpacity>
          : null}
      </View>
      <FlatList
        style={styles.list}
        data={list}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <Item item={item} playing={false} onPlay={play} onDelete={handleDelete} />}
        ListEmptyComponent={<Text size={13} color={theme['c-font-label']} style={styles.empty}>{t('download_empty_tip')}</Text>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerSub: {
    marginTop: 3,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 14,
  },
  playAllText: {
    marginLeft: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  itemContent: {
    flex: 1,
    paddingRight: 8,
  },
  itemSub: {
    marginTop: 3,
  },
  deleteBtn: {
    padding: 6,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    paddingLeft: 30,
    paddingRight: 30,
    lineHeight: 20,
  },
})
