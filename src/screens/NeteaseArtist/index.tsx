import { memo, useCallback, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getArtistSongs } from '@/core/netease'

interface Props {
  componentId: string
  artistId: string | number
  artistName?: string
}

/** 歌手热门歌曲（1.20.0，从关注歌手列表进入） */
export default memo(({ componentId, artistId, artistName }: Props) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseArtist, componentId)
  }, [componentId])

  const loader = useCallback(async() => getArtistSongs(artistId), [artistId])
  return (
    <SongListView
      componentId={componentId}
      title={artistName ?? t('netease_artist_songs')}
      listKey={`netease_artist_${artistId}`}
      loader={loader}
      emptyTip={t('netease_artist_empty')}
    />
  )
})
