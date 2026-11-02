import { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
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
import { checkDirectoryWritable } from '@/core/download'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const ROOT_PATH = RNFS.ExternalStorageDirectoryPath

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
  const [dirs, setDirs] = useState<DirItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.directoryPicker, componentId)
    return () => {
      // 没有点“选择”就退出时，把等待中的 Promise 置空
      cancelPickDirectory()
    }
  }, [componentId])

  const load = useCallback((target: string) => {
    setLoading(true)
    void RNFS.readDir(target).then((items) => {
      const list = items
        .filter(item => item.isDirectory() && !item.name.startsWith('.'))
        .map(item => ({ name: item.name, path: item.path }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      setDirs(list)
      setPath(target)
    }).catch((err: Error) => {
      toast(`${t('dir_picker_no_permission')}: ${err?.message ?? ''}`, 'long')
      setDirs([])
    }).finally(() => {
      setLoading(false)
    })
  }, [t])

  useEffect(() => {
    load(path)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goParent = () => {
    if (path == ROOT_PATH || path.length <= ROOT_PATH.length) return
    const parent = path.slice(0, path.lastIndexOf('/')) || ROOT_PATH
    load(parent)
  }

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
        <Text size={11} color={theme['c-font-label']} style={styles.pathText} numberOfLines={1} ellipsizeMode="head">
          {path}
        </Text>
      </View>

      {
        loading
          ? <View style={styles.center}><Loading color={theme['c-font']} /></View>
          : <FlatList
              style={styles.list}
              data={dirs}
              keyExtractor={item => item.path}
              ListHeaderComponent={path == ROOT_PATH
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
  pathText: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 8,
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
