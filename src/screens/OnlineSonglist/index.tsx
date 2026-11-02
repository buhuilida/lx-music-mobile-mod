import { memo, useCallback, useEffect, useState } from 'react'
import { ScrollView, TextInput, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Loading from '@/components/common/Loading'
import { pop, navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { getData, saveData } from '@/plugins/storage'
import { getListDetail } from '@/core/songlist'
import { parsePlaylistInput, SOURCE_LABELS } from '@/core/onlinePlaylist'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'
import { friendlyError } from '@/utils/errorMsg'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const storageKey = '@__online_playlist_history__'

interface HistoryItem {
  source: LX.OnlineSource
  id: string
  rawId: string
  name: string
  author?: string
  time: number
}

/**
 * 在线歌单（1.19.0）
 *
 * 粘贴网易云 / QQ / 酷狗的分享链接或歌单 ID，直接解析成歌单并打开详情页，
 * 详情页复用已有的播放全部、收藏到列表、下载等能力。
 * 网易云私密歌单会自动带上「平台设置」里保存的 MUSIC_U。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.onlineSonglist, componentId)
    void getData<HistoryItem[]>(storageKey).then((list) => {
      if (Array.isArray(list)) setHistory(list.slice(0, 20))
    }).catch(() => {})
  }, [componentId])

  const saveHistory = useCallback((list: HistoryItem[]) => {
    setHistory(list)
    void saveData(storageKey, list).catch(() => {})
  }, [])

  const open = useCallback(async(raw: string) => {
    const parsed = parsePlaylistInput(raw)
    if (!parsed) {
      toast(t('online_source_unknown'), 'long')
      return
    }
    setLoading(true)
    try {
      const detail = await getListDetail(parsed.id, parsed.source, 1, true)
      const info = detail.info ?? {}
      const name = info.name ?? t('online_title')
      const nextHistory: HistoryItem[] = [
        { source: parsed.source, id: parsed.id, rawId: parsed.rawId, name, author: info.author, time: Date.now() },
        ...history.filter(item => item.id != parsed.id),
      ].slice(0, 20)
      saveHistory(nextHistory)

      const homeId = commonState.componentIds.home
      if (!homeId) return
      navigations.pushSonglistDetailScreen(homeId, {
        id: parsed.id,
        source: parsed.source,
        name,
        author: info.author ?? '',
        img: info.img,
        desc: info.desc,
        play_count: info.play_count,
        total: String(detail.total ?? ''),
      })
      setInput('')
    } catch (err: any) {
      toast(t('online_failed', { msg: friendlyError(err) }), 'long')
    } finally {
      setLoading(false)
    }
  }, [history, saveHistory, t])

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.headerBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>{t('online_title')}</Text>
          <View style={styles.headerBtn} />
        </View>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('online_input_placeholder')}
            placeholderTextColor={theme['c-350']}
            style={[styles.input, { color: theme['c-font'], backgroundColor: theme['c-content-background'] }]}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
            returnKeyType="go"
            onSubmitEditing={() => { void open(input) }}
          />
          <TouchableOpacity
            style={[styles.openBtn, { backgroundColor: theme['c-primary-background'] }]}
            onPress={() => { void open(input) }}
            disabled={loading}
          >
            {
              loading
                ? <Loading color={theme['c-primary-font']} size={14} />
                : <Text size={13} color={theme['c-primary-font']}>{t('online_open')}</Text>
            }
          </TouchableOpacity>
        </View>

        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('online_tip')}</Text>

        <View style={styles.quickRow}>
          {(['wy', 'tx', 'kg'] as LX.OnlineSource[]).map(source => (
            <TouchableOpacity
              key={source}
              style={[styles.chip, { borderColor: theme['c-border-background'] }]}
              onPress={() => { setInput(`${source}:`) }}
            >
              <Text size={11} color={theme['c-font-label']}>{SOURCE_LABELS[source]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {
          history.length
            ? <View style={styles.history}>
                <Text size={12} color={theme['c-font-label']} style={styles.historyTitle}>{t('online_history')}</Text>
                {history.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyItem}
                    activeOpacity={0.6}
                    onPress={() => { void open(`${item.source}:${item.rawId}`) }}
                  >
                    <Icon name="album" size={16} color={theme['c-350']} />
                    <View style={styles.historyContent}>
                      <Text size={14} numberOfLines={1}>{item.name}</Text>
                      <Text size={11} numberOfLines={1} color={theme['c-font-label']} style={styles.historySub}>
                        {`${SOURCE_LABELS[item.source]} · ${item.author ?? ''}`}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={14} color={theme['c-350']} />
                  </TouchableOpacity>
                ))}
              </View>
            : null
        }
      </ScrollView>
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
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    height: 42,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
  },
  openBtn: {
    marginLeft: 10,
    height: 42,
    minWidth: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 12,
  },
  tip: {
    marginTop: 10,
    lineHeight: 16,
  },
  quickRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 3,
    paddingBottom: 3,
  },
  history: {
    marginTop: 24,
  },
  historyTitle: {
    marginBottom: 4,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 11,
    paddingBottom: 11,
  },
  historyContent: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
  historySub: {
    marginTop: 2,
  },
})
