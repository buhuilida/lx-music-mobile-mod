import { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, ScrollView, TextInput, TouchableOpacity, View } from 'react-native'
import RNFS from 'react-native-fs'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Loading from '@/components/common/Loading'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { cancelPickDirectory, finishPickDirectory } from '@/core/download/directoryPicker'
import { checkDirectoryWritable, privateDownloadDirectoryPath } from '@/core/download'
import { privateStorageDirectoryPath } from '@/utils/fs'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const ROOT_PATH = RNFS.ExternalStorageDirectoryPath
const STORAGE_ROOT = '/storage'

interface DirItem {
  name: string
  path: string
}

/**
 * 下载目录选择（1.19.0）
 *
 * 系统自带的 SAF 目录选择器返回的是 content:// URI，RNFS 无法直接写文件，
 * 所以这里用应用内目录浏览器：只在真实文件路径下浏览，选中的目录一定能写。
 */
export default memo(({ componentId, initialPath }: { componentId: string, initialPath?: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const savePath = useSettingValue('download.savePath')
  const [path, setPath] = useState(initialPath ?? (savePath || ROOT_PATH))
  const [inputPath, setInputPath] = useState(path)
  const [dirs, setDirs] = useState<DirItem[]>([])
  const [loading, setLoading] = useState(true)
  // 可挂载的存储卷：内部存储 + SD 卡（/storage 下除 emulated 之外的目录）
  const [volumes, setVolumes] = useState<DirItem[]>([{ name: '内部存储', path: ROOT_PATH }])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.directoryPicker, componentId)
    return () => {
      // 没有点“选择”就退出时，把等待中的 Promise 置空
      cancelPickDirectory()
    }
  }, [componentId])

  useEffect(() => {
    void RNFS.readDir(STORAGE_ROOT).then((items) => {
      const list = items
        .filter(item => item.isDirectory())
        .map<DirItem>(item => ({
        name: item.name == 'emulated' ? t('dir_picker_internal') : `${t('dir_picker_sdcard')} ${item.name}`,
        path: item.path,
      }))
      if (!list.some(item => item.path == ROOT_PATH)) list.unshift({ name: t('dir_picker_internal'), path: ROOT_PATH })
      setVolumes(list)
    }).catch(() => {})
  }, [t])

  const load = useCallback((target: string) => {
    setLoading(true)
    void RNFS.readDir(target).then((items) => {
      const list = items
        .filter(item => item.isDirectory() && !item.name.startsWith('.'))
        .map(item => ({ name: item.name, path: item.path }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      setDirs(list)
      setPath(target)
      setInputPath(target)
    }).catch((err: Error) => {
      toast(`${t('dir_picker_no_permission')}: ${err?.message ?? ''}`, 'long')
      setDirs([])
      setPath(target)
      setInputPath(target)
    }).finally(() => {
      setLoading(false)
    })
  }, [t])

  useEffect(() => {
    load(path)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goParent = () => {
    if (path == '/') return
    const parent = path.slice(0, path.lastIndexOf('/')) || '/'
    load(parent)
  }

  const jumpToInput = () => {
    const target = inputPath.trim().replace(/\/+$/, '') || '/'
    if (!target.startsWith('/')) {
      toast(t('dir_picker_invalid_path'), 'long')
      return
    }
    load(target)
  }

  const shortcuts: DirItem[] = [
    { name: t('dir_picker_download'), path: RNFS.DownloadDirectoryPath },
    { name: t('dir_picker_music'), path: `${ROOT_PATH}/Music` },
    { name: t('dir_picker_private'), path: privateStorageDirectoryPath },
    { name: t('dir_picker_private_download'), path: privateDownloadDirectoryPath },
  ]

  const handleSelect = () => {
    void checkDirectoryWritable(path).then((ok) => {
      if (!ok) {
        toast(t('dir_picker_unwritable'), 'long')
        return
      }
      finishPickDirectory(path)
      void pop(componentId)
    })
  }

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.headerBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>{t('dir_picker_title')}</Text>
          <TouchableOpacity onPress={handleSelect} style={styles.headerBtn}>
            <Text size={13} color={theme['c-primary-font']}>{t('dir_picker_select')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pathRow}>
          <TextInput
            value={inputPath}
            onChangeText={setInputPath}
            onSubmitEditing={jumpToInput}
            style={[styles.pathInput, { color: theme['c-font'], backgroundColor: theme['c-primary-input-background'] }]}
            placeholder={t('dir_picker_input_placeholder')}
            placeholderTextColor={theme['c-350']}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
          <TouchableOpacity onPress={jumpToInput} style={styles.goBtn} activeOpacity={0.6}>
            <Text size={12} color={theme['c-primary-font']}>{t('dir_picker_go')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBar}
          contentContainerStyle={styles.chips}
        >
          {[...volumes, ...shortcuts].map(item => (
            <TouchableOpacity
              key={item.path}
              style={[styles.chip, { backgroundColor: path == item.path ? theme['c-primary-alpha-600'] : theme['c-button-background'] }]}
              onPress={() => { load(item.path) }}
              activeOpacity={0.6}
            >
              <Text
                size={11}
                color={path == item.path ? theme['c-button-font-selected'] : theme['c-button-font']}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {
        loading
          ? <View style={styles.center}><Loading color={theme['c-font']} /></View>
          : <FlatList
              style={styles.list}
              data={dirs}
              keyExtractor={item => item.path}
              ListHeaderComponent={path == '/'
                ? null
                : <TouchableOpacity style={styles.item} onPress={goParent} activeOpacity={0.6}>
                    <Icon name="chevron-left" size={16} color={theme['c-font-label']} />
                    <Text size={14} color={theme['c-font-label']} style={styles.itemText}>{t('dir_picker_parent')}</Text>
                  </TouchableOpacity>}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text size={13} color={theme['c-font-label']}>{t('dir_picker_empty')}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.item} onPress={() => { load(item.path) }} activeOpacity={0.6}>
                  <Icon name="album" size={16} color={theme['c-350']} />
                  <Text size={14} numberOfLines={1} style={styles.itemText}>{item.name}</Text>
                  <Icon name="chevron-right" size={14} color={theme['c-350']} />
                </TouchableOpacity>
              )}
            />
      }
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
    minWidth: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    paddingRight: 8,
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 6,
    gap: 8,
  },
  pathInput: {
    flexGrow: 1,
    flexShrink: 1,
    height: 34,
    borderRadius: 4,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 12,
  },
  goBtn: {
    height: 34,
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  },
  chipBar: {
    flexGrow: 0,
    paddingBottom: 8,
  },
  chips: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    maxWidth: 180,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 12,
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    gap: 10,
  },
  itemText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
})
