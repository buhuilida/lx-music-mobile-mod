import { memo, useCallback, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getAlbumSongs } from '@/core/netease'

interface Props {
  componentId: string
  albumId: string | number
  albumName?: string
}

/** 专辑歌曲（1.21.0，从收藏专辑 / 新碟上架进入） */
export default memo(({ componentId, albumId, albumName }: Props) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseAlbumSongs, componentId)
  }, [componentId])

  const loader = useCallback(async() => getAlbumSongs(albumId), [albumId])
  return (
    <SongListView
      componentId={componentId}
      title={albumName ?? t('netease_album')}
      listKey={`netease_album_${albumId}`}
      loader={loader}
      emptyTip={t('netease_album_empty')}
    />
  )
})
