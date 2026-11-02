import { memo, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getCloudSongs } from '@/core/netease'

/** 网易云云盘（1.20.0） */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseCloud, componentId)
  }, [componentId])

  return (
    <SongListView
      componentId={componentId}
      title={t('netease_cloud')}
      listKey="netease_cloud"
      loader={getCloudSongs}
      requireLogin
      emptyTip={t('netease_cloud_empty')}
    />
  )
})
