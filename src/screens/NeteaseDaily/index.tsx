import { memo, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getDailyRecommend, isNeteaseLoggedIn } from '@/core/netease'

/**
 * 网易云每日推荐（1.20.0）
 *
 * 需要登录后才有数据；未登录时列表页直接给出去登录的入口。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseDaily, componentId)
  }, [componentId])

  return (
    <SongListView
      componentId={componentId}
      title={t('netease_daily')}
      listKey="netease_daily"
      loader={getDailyRecommend}
      requireLogin
      loggedIn={isNeteaseLoggedIn()}
      emptyTip={t('netease_daily_empty')}
    />
  )
})
