import { memo, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getLikedSongs } from '@/core/netease'

/** 我喜欢的音乐（1.20.0） */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseLiked, componentId)
  }, [componentId])

  return (
    <SongListView
      componentId={componentId}
      title={t('netease_liked')}
      listKey="netease_liked"
      loader={getLikedSongs}
      requireLogin
      emptyTip={t('netease_liked_empty')}
    />
  )
})
