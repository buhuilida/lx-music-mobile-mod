import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { buildItemId, downloadMusic, getMusicQualities } from '@/core/download'
import { useDownloadList } from '@/store/download/hook'
import { getQualityLabel } from '@/config/quality'
import { createStyle, toast } from '@/utils/tools'
import { useBaiduPanAuth } from '@/core/baiduPan/auth'
import { parseFavorites } from '@/core/baiduPan/favorites'
import { listDir } from '@/core/baiduPan/api'
import { waitForDirSelection } from '@/core/baiduPan/selection'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'

/** 快捷目录的来源：用户收藏 + 这个目录下的子文件夹 */
const QUICK_DIR_ROOT = '/拟声'

/**
 * 「下载并上传到网盘」按钮
 *
 * 点开就是一个弹窗：上半部分选音质（默认最低档），下半部分选保存目录。
 * 目录 = 用户收藏 + /拟声 下的子文件夹 + 当前设置目录，末尾还有「从根目录选择」。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const popupRef = useRef<PopupType>(null)
  const playMusicInfo = usePlayMusicInfo()
  const downloads = useDownloadList()
  const auth = useBaiduPanAuth()
  const favorites = parseFavorites(useSettingValue('download.baiduPanFavorites'))
  const defaultDir = useSettingValue('download.baiduPanDir')
  const [quality, setQuality] = useState<LX.Quality>('128k')
  const [quickDirs, setQuickDirs] = useState<string[]>([])
  const [loadingDirs, setLoadingDirs] = useState(false)

  const musicInfo = useMemo(() => {
    const info = playMusicInfo.musicInfo
    if (!info || 'progress' in info) return null
    return info.source == 'local' ? null : info
  }, [playMusicInfo])

  const qualities = useMemo(() => (musicInfo ? getMusicQualities(musicInfo) : []), [musicInfo])

  const dirOptions = useMemo(() => {
    const list = [...favorites, ...quickDirs]
    if (defaultDir) list.push(defaultDir)
    return Array.from(new Set(list.filter(Boolean)))
  }, [favorites, quickDirs, defaultDir])

  const getComponentId = () => {
    const ids = commonState.componentIds
    return ids.playDetail ?? ids.home ?? Object.values(ids)[0]
  }

  /** 拉一下 /拟声 下的子文件夹，作为快捷选项 */
  const loadQuickDirs = useCallback(async() => {
    setLoadingDirs(true)
    try {
      const list = await listDir(QUICK_DIR_ROOT)
      setQuickDirs(list.filter((item) => item.isdir).map((item) => item.path))
    } catch {
      setQuickDirs([])
    } finally {
      setLoadingDirs(false)
    }
  }, [])

  const startToDir = (dir: string) => {
    if (!musicInfo) return
    popupRef.current?.setVisible(false)
    if (downloads.some((item) => item.id == buildItemId(musicInfo, quality))) {
      toast(t('download_exists'))
      return
    }
    toast(`${t('baidu_pan_download_started')} · ${getQualityLabel(quality)} · ${dir}`)
    void downloadMusic(musicInfo, quality, { panDir: dir })
  }

  const pickFromRoot = () => {
    if (!musicInfo) return
    popupRef.current?.setVisible(false)
    const componentId = getComponentId()
    if (!componentId) return
    waitForDirSelection((path) => { startToDir(path) })
    navigations.pushBaiduPanDirScreen(componentId)
  }

  const handlePress = () => {
    if (!musicInfo) {
      toast(t('download_local_tip'))
      return
    }
    if (!auth) {
      toast(t('setting_download_save_target_baidu_tip'))
      return
    }
    // 默认最低音质，想要更好的手动切
    setQuality(qualities[0] ?? '128k')
    void loadQuickDirs()
    popupRef.current?.setVisible(true)
  }

  return (
    <>
      <TouchableOpacity onPress={handlePress} style={styles.button}>
        <Icon name="add_folder" size={18} color={auth ? undefined : theme['c-font-label']} />
      </TouchableOpacity>

      <Popup ref={popupRef} title={t('baidu_pan_download_title')} position="bottom">
        <ScrollView style={styles.list}>
          <Text size={11} color={theme['c-font-label']} style={styles.section}>{t('download_select_quality')}</Text>
          <View style={styles.chips}>
            {qualities.map((item) => {
              const active = item === quality
              return (
                <TouchableOpacity
                  key={item}
                  activeOpacity={0.7}
                  onPress={() => setQuality(item)}
                  style={{
                    ...styles.chip,
                    borderColor: active ? theme['c-primary'] : theme['c-400'],
                    backgroundColor: active ? theme['c-primary'] : 'transparent',
                  }}
                >
                  <Text size={12} color={active ? theme['c-primary-font'] : theme['c-font']}>
                    {getQualityLabel(item)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text size={11} color={theme['c-font-label']} style={styles.section}>{t('baidu_pan_download_dir')}</Text>
          {dirOptions.map((dir) => (
            <TouchableOpacity key={dir} style={styles.item} activeOpacity={0.6} onPress={() => startToDir(dir)}>
              <Text numberOfLines={1} size={13} style={styles.itemName}>{dir}</Text>
            </TouchableOpacity>
          ))}
          {loadingDirs
            ? <Text size={11} color={theme['c-font-label']} style={styles.item}>{t('baidu_pan_dir_loading')}</Text>
            : null}
          <TouchableOpacity style={styles.item} activeOpacity={0.6} onPress={pickFromRoot}>
            <Text size={13} color={theme['c-primary']}>{t('baidu_pan_download_pick')}</Text>
          </TouchableOpacity>
        </ScrollView>
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
  list: {
    maxHeight: 400,
    paddingBottom: 10,
  },
  section: {
    paddingLeft: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 20,
    paddingRight: 20,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 4,
    paddingBottom: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  item: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    marginRight: 8,
  },
})
