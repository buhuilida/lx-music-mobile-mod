import { memo, useMemo, useEffect } from 'react'

import SongListView from '@/components/SongListView'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import {
  getQQDailyRecommend,
  getQQGuessSongs,
  getQQHomeRecommend,
  getQQLikedSongs,
  getQQNewSongs,
  getQQRadarSongs,
} from '@/core/qq'
import { getKgDailyRecommend, getKgLikedSongs } from '@/core/kugou'

/**
 * 平台推荐歌曲列表（1.22.4）
 *
 * 之前「我的音乐」里 QQ / 酷狗的推荐类入口是直接换播放队列，
 * 点了就跳到播放页、看不到列表，用户会以为功能坏了。
 * 这里统一给一个真实列表页：歌曲清单 + 播放全部 + 单曲下载，
 * 与网易云的「每日推荐 / 我喜欢」保持一致的交互。
 */

export type PlatformSongKind =
  | 'tx-daily' | 'tx-liked' | 'tx-home' | 'tx-radar' | 'tx-new' | 'tx-guess'
  | 'kg-daily' | 'kg-liked'

const LOADERS: Record<PlatformSongKind, () => Promise<LX.Music.MusicInfoOnline[]>> = {
  'tx-daily': getQQDailyRecommend,
  'tx-liked': getQQLikedSongs,
  'tx-home': getQQHomeRecommend,
  'tx-radar': getQQRadarSongs,
  'tx-new': getQQNewSongs,
  'tx-guess': getQQGuessSongs,
  'kg-daily': getKgDailyRecommend,
  'kg-liked': getKgLikedSongs,
}

export default memo(({ componentId, kind }: { componentId: string, kind: PlatformSongKind }) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.platformList, componentId)
  }, [componentId])

  const { title, emptyTip } = useMemo(() => {
    switch (kind) {
      case 'tx-daily': return { title: t('qq_daily'), emptyTip: t('qq_daily_empty') }
      case 'tx-liked': return { title: t('qq_liked'), emptyTip: t('qq_liked_empty') }
      case 'tx-home': return { title: t('qq_home_recommend'), emptyTip: t('qq_home_empty') }
      case 'tx-radar': return { title: t('qq_radar'), emptyTip: t('qq_radar_empty') }
      case 'tx-new': return { title: t('qq_new_songs'), emptyTip: t('qq_new_empty') }
      case 'tx-guess': return { title: t('qq_guess'), emptyTip: t('qq_guess_empty') }
      case 'kg-daily': return { title: t('kg_daily'), emptyTip: t('kg_daily_empty') }
      default: return { title: t('kg_liked'), emptyTip: t('kg_liked_empty') }
    }
  }, [kind, t])

  return (
    <SongListView
      componentId={componentId}
      title={title}
      listKey={`platform_${kind}`}
      loader={LOADERS[kind]}
      requireLogin={kind != 'kg-daily'}
      emptyTip={emptyTip}
    />
  )
})
