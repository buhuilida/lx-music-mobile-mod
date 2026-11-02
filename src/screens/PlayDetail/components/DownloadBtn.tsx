import { memo, useMemo, useRef } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useDownloadList } from '@/store/download/hook'
import { useI18n } from '@/lang'
import { buildItemId, downloadMusic, getBestQuality, getMusicQualities } from '@/core/download'
import { getQualityLabel } from '@/config/quality'
import { createStyle, toast } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const popupRef = useRef<PopupType>(null)
  const playMusicInfo = usePlayMusicInfo()
  const downloads = useDownloadList()

  // 下载项与本地歌曲不需要再次下载
  const musicInfo = useMemo(() => {
    const info = playMusicInfo.musicInfo
    if (!info || 'progress' in info) return null
    return info.source == 'local' ? null : info
  }, [playMusicInfo])

  const isLocal = !musicInfo

  const qualities = useMemo(() => {
    if (!musicInfo) return []
    return getMusicQualities(musicInfo)
  }, [musicInfo])

  const handlePress = () => {
    if (!musicInfo) {
      toast(t('download_local_tip'))
      return
    }
    popupRef.current?.setVisible(true)
  }

  const startDownload = (quality: LX.Quality) => {
    if (!musicInfo) return
    const id = buildItemId(musicInfo, quality)
    if (downloads.some(item => item.id == id)) {
      toast(t('download_exists'))
      return
    }
    popupRef.current?.setVisible(false)
    toast(t('download_started', { name: musicInfo.name }))
    void downloadMusic(musicInfo, quality)
  }

  return (
    <>
      <TouchableOpacity onPress={handlePress} style={styles.button}>
        <Icon name="download-2" size={18} color={isLocal ? theme['c-font-label'] : undefined} />
      </TouchableOpacity>
      <Popup ref={popupRef} title={t('download_select_quality')} position="bottom">
        <View style={styles.qualityList}>
          {musicInfo
            ? <TouchableOpacity
                style={styles.qualityItem}
                onPress={() => { startDownload(getBestQuality(musicInfo)) }}
                activeOpacity={0.6}
              >
                <Text size={14} color={theme['c-primary-font']}>{t('download_best_quality')}</Text>
                <Text size={11} color={theme['c-font-label']}>{getQualityLabel(getBestQuality(musicInfo))}</Text>
              </TouchableOpacity>
            : null}
          {qualities.map(quality => (
            <TouchableOpacity
              key={quality}
              style={styles.qualityItem}
              onPress={() => { startDownload(quality) }}
              activeOpacity={0.6}
            >
              <Text size={14}>{getQualityLabel(quality)}</Text>
              <Text size={11} color={theme['c-font-label']}>{`${musicInfo?.name ?? ''}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Popup>
    </>
  )
})

const styles = createStyle({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    width: 36,
  },
  qualityList: {
    paddingBottom: 10,
  },
  qualityItem: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
})
