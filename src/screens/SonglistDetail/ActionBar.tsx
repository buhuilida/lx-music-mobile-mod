import { memo, useCallback, useRef } from 'react'
import { View } from 'react-native'
import Button from '@/components/common/Button'
import BatchDownloadLyricModal, { type BatchDownloadLyricModalType } from '@/components/BatchDownloadLyricModal'

import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { pop } from '@/navigation'
import { useTheme } from '@/store/theme/hook'
import commonState from '@/store/common/state'
import Text from '@/components/common/Text'
import { handleCollect, handlePlay } from './listAction'
import songlistState from '@/store/songlist/state'
import { useI18n } from '@/lang'
import { useListInfo } from './state'
import { downloadMusics } from '@/core/download'
// import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const info = useListInfo()
  const batchModalRef = useRef<BatchDownloadLyricModalType>(null)

  const back = () => {
    void pop(commonState.componentIds.songlistDetail!)
  }

  const handlePlayAll = () => {
    if (!songlistState.listDetailInfo.info.name) return
    void handlePlay(info.id, info.source, songlistState.listDetailInfo.list)
  }

  const handleDownloadAll = () => {
    const list = songlistState.listDetailInfo.list
    if (!list?.length) {
      toast(t('download_all_none'))
      return
    }
    // 先探测整张歌单的歌词情况，弹汇总窗让用户勾选后再下
    batchModalRef.current?.show(list as LX.Music.MusicInfo[])
  }

  const handleBatchConfirm = useCallback((musics: LX.Music.MusicInfo[]) => {
    if (!musics.length) return
    toast(t('download_all_started', { count: musics.length }))
    void downloadMusics(musics).then(({ success, failed }) => {
      toast(t('download_all_done', { success, failed }), 'long')
    }).catch((err: Error) => {
      toast(err?.message ?? 'download failed', 'long')
    })
  }, [t])

  const handleCollection = () => {
    if (!songlistState.listDetailInfo.info.name) return
    void handleCollect(info.id, info.source, songlistState.listDetailInfo.info.name || info.name)
  }

  return (
    <View style={styles.container}>
      <Button onPress={handleCollection} style={styles.controlBtn}>
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('collect_songlist')}</Text>
      </Button>
      <Button onPress={handlePlayAll} style={styles.controlBtn}>
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('play_all')}</Text>
      </Button>
      <Button onPress={handleDownloadAll} style={styles.controlBtn}>
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('download_all')}</Text>
      </Button>
      <Button onPress={back} style={styles.controlBtn}>
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('back')}</Text>
      </Button>
      <BatchDownloadLyricModal ref={batchModalRef} onConfirm={handleBatchConfirm} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  controlBtn: {
    flexGrow: 1,
    flexShrink: 1,
    width: '25%',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 10,
    paddingRight: 10,
  },
  controlBtnText: {
    fontSize: 13,
    textAlign: 'center',
  },
})

