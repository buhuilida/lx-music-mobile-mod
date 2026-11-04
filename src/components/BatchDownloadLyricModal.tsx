import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, useWindowDimensions, View } from 'react-native'

import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { probeLyrics, type LyricProbeState } from '@/core/download/probeLyric'

interface Row {
  musicInfo: LX.Music.MusicInfo
  state: LyricProbeState
  checked: boolean
}

export interface BatchDownloadLyricModalType {
  show: (musicInfos: LX.Music.MusicInfo[]) => void
}

interface Props {
  /** 用户确认后回调实际要下载的歌曲（已按勾选过滤） */
  onConfirm: (musicInfos: LX.Music.MusicInfo[]) => void
}

/**
 * 批量下载前的歌词汇总弹窗
 *
 * 列出每首歌的歌词情况（逐字 / 仅逐行 / 无歌词）：
 * - 无歌词的默认不勾选（不下），用户可手动勾回来（勾回则只下音频、不写歌词）
 * - 底部按钮文案随勾选数量变化
 */
export default forwardRef<BatchDownloadLyricModalType, Props>(({ onConfirm }, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const { height: screenHeight } = useWindowDimensions()
  const alertRef = useRef<ConfirmAlertType>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [rows, setRows] = useState<Row[]>([])

  useImperativeHandle(ref, () => ({
    show(musicInfos) {
      if (!musicInfos.length) return
      setVisible(true)
      setLoading(true)
      setRows([])
      setProgress({ current: 0, total: musicInfos.length })
      void probeLyrics(musicInfos, {
        concurrency: 4,
        onProgress: (current, total) => setProgress({ current, total }),
      }).then((results) => {
        setRows(results.map((result) => ({
          musicInfo: result.musicInfo,
          state: result.state,
          checked: result.state != 'none',
        })))
        setLoading(false)
      })
    },
  }))

  // ConfirmAlert 是命令式弹窗：等组件挂载完、探测结束后再唤起
  useEffect(() => {
    if (visible && !loading) alertRef.current?.setVisible(true)
  }, [visible, loading])

  const checkedList = useMemo(() => rows.filter((row) => row.checked), [rows])

  const summary = useMemo(() => {
    const line = rows.filter((row) => row.state == 'line').length
    const none = rows.filter((row) => row.state == 'none').length
    return t('download_batch_lyric_summary', { count: rows.length, line, none })
  }, [rows, t])

  const handleToggle = useCallback((index: number) => {
    setRows((prev) => {
      const next = prev.slice()
      next[index] = { ...next[index], checked: !next[index].checked }
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => {
    alertRef.current?.setVisible(false)
    onConfirm(checkedList.map((row) => row.musicInfo))
  }, [checkedList, onConfirm])

  const stateText = (state: LyricProbeState) => {
    switch (state) {
      case 'word': return t('download_lyric_state_word')
      case 'line': return t('download_lyric_state_line')
      default: return t('download_lyric_state_none')
    }
  }
  const stateColor = (state: LyricProbeState) => {
    switch (state) {
      case 'word': return theme['c-primary']
      case 'line': return theme['c-font-label']
      default: return theme['c-font-label']
    }
  }

  return visible
    ? (
      <ConfirmAlert
        ref={alertRef}
        onConfirm={handleConfirm}
        onHide={() => setVisible(false)}
        title={t('download_batch_lyric_title', { count: loading ? progress.total : rows.length })}
        cancelText={t('download_cancel')}
        confirmText={t('download_continue_count', { count: checkedList.length })}
        disabledConfirm={loading || !checkedList.length}
      >
        <View style={styles.content}>
          {loading
            ? (
              <View style={styles.loading}>
                <Text size={13} color={theme['c-font-label']}>
                  {t('download_checking_lyric', { current: progress.current, total: progress.total })}
                </Text>
              </View>
              )
            : (
              <>
                <FlatList
                  data={rows}
                  keyExtractor={(item, index) => `${item.musicInfo.id}_${index}`}
                  style={{ maxHeight: screenHeight * 0.5 }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => handleToggle(index)} style={styles.row}>
                      <View style={{
                        ...styles.checkbox,
                        borderColor: item.checked ? theme['c-primary'] : theme['c-400'],
                        backgroundColor: item.checked ? theme['c-primary'] : 'rgba(0,0,0,0)',
                      }}
                      >
                        {item.checked ? <Text size={10} color={theme['c-primary-font']}>✓</Text> : null}
                      </View>
                      <Text style={styles.name} numberOfLines={1} size={13}>
                        {`${item.musicInfo.name} - ${item.musicInfo.singer}`}
                      </Text>
                      <Text size={11} color={stateColor(item.state)}>{stateText(item.state)}</Text>
                    </TouchableOpacity>
                  )}
                />
                <Text style={styles.summary} size={11} color={theme['c-font-label']}>{summary}</Text>
              </>
              )}
        </View>
      </ConfirmAlert>
    )
    : null
})

const styles = createStyle({
  content: {
    flexGrow: 1,
    flexShrink: 1,
  },
  loading: {
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    marginRight: 8,
  },
  summary: {
    marginTop: 8,
    marginBottom: 4,
  },
})
