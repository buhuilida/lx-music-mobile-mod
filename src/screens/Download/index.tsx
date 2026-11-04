import { memo, useCallback, useEffect, useMemo } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useDownloadList } from '@/store/download/hook'
import { useI18n } from '@/lang'
import { getQualityLabel } from '@/config/quality'
import { buildLocalMusicInfo, formatSize, removeDownload, retryUpload, uploadItemToPan } from '@/core/download'
import { useBaiduPanAuth } from '@/core/baiduPan/auth'
import { playMusicInfo } from '@/core/player/player'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

const DownloadItem = memo(({ item, onPlay, onDelete, onRetryUpload, onUpload, canUpload }: {
  item: LX.Download.ExtItem
  onPlay: (item: LX.Download.ExtItem) => void
  onDelete: (item: LX.Download.ExtItem) => void
  onRetryUpload: (item: LX.Download.ExtItem) => void
  onUpload: (item: LX.Download.ExtItem) => void
  canUpload: boolean
}) => {
  const theme = useTheme()
  const t = useI18n()
  const upload = item.upload

  const renderUpload = () => {
    if (!upload) return null
    switch (upload.status) {
      case 'uploading':
        return (
          <Text numberOfLines={1} size={11} color={theme['c-primary']} style={styles.itemSub}>
            {t('baidu_pan_uploading', { progress: upload.progress })}
          </Text>
        )
      case 'success':
        return (
          <Text numberOfLines={1} size={11} color={theme['c-primary']} style={styles.itemSub}>
            {t('baidu_pan_uploaded')}
          </Text>
        )
      default:
        return (
          <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.itemSub}>
            {`${t('baidu_pan_upload_failed')}：${upload.errorMsg ?? ''}`}
          </Text>
        )
    }
  }

  return (
    <TouchableOpacity style={styles.item} activeOpacity={0.6} onPress={() => { onPlay(item) }}>
      <View style={styles.itemContent}>
        <Text numberOfLines={1} size={14}>{item.musicInfo.name}</Text>
        <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.itemSub}>
          {`${item.musicInfo.singer} · ${getQualityLabel(item.quality)} · ${formatSize(item.size)}`}
        </Text>
        {renderUpload()}
      </View>
      {!upload && canUpload
        ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => { onUpload(item) }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text size={11} color={theme['c-primary']}>{t('baidu_pan_upload_action')}</Text>
          </TouchableOpacity>
          )
        : null}
      {upload?.status == 'fail'
        ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => { onRetryUpload(item) }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="available_updates" size={15} color={theme['c-primary']} />
          </TouchableOpacity>
          )
        : null}
      <TouchableOpacity style={styles.deleteBtn} onPress={() => { onDelete(item) }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="close" size={14} color={theme['c-font-label']} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const list = useDownloadList()
  // 已登录网盘时才显示「上传」按钮，避免点了必然失败
  const panAuth = useBaiduPanAuth()

  // 注册当前屏幕 id：首页的抽屉需要在「其他屏幕退出」时收到通知才能恢复
  useEffect(() => {
    setComponentId(COMPONENT_IDS.download, componentId)
  }, [componentId])

  const totalSize = useMemo(() => list.reduce((sum, item) => sum + item.size, 0), [list])

  const handlePlay = useCallback((item: LX.Download.ExtItem) => {
    void playMusicInfo(buildLocalMusicInfo(item)).then(() => {
      toast(t('download_play_tip'))
    })
  }, [t])

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
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.backBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <View style={styles.titleContent}>
            <Text numberOfLines={1} size={16}>{t('download_title')}</Text>
            <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
              {list.length ? `${list.length} 首 · ${formatSize(totalSize)}` : t('download_empty')}
            </Text>
          </View>
        </View>
      </View>
      <FlatList
        style={styles.list}
        data={list}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <DownloadItem
            item={item}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onRetryUpload={(row) => { void retryUpload(row.id) }}
            onUpload={(row) => { void uploadItemToPan(row.id) }}
            canUpload={!!panAuth}
          />
        )}
        ListEmptyComponent={<Text size={13} color={theme['c-font-label']} style={styles.empty}>{t('download_empty_tip')}</Text>}
        contentContainerStyle={styles.listContent}
      />
    </PageContent>
  )
})

const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 10,
  },
  backBtn: {
    width: HEADER_HEIGHT,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 2,
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
  },
})
