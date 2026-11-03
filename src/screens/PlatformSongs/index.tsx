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
  isQQLoggedIn,
} from '@/core/qq'
import { getKgDailyRecommend, getKgLikedSongs, getKgNewSongs, isKgLoggedIn } from '@/core/kugou'
import { getPersonalFmSongs } from '@/core/netease'

/**
 * 平台推荐歌曲列表（1.22.4）
 *
 * 之前「我的音乐」里 QQ / 酷狗的推荐类入口是直接换播放队列，
 * 点了就跳到播放页、看不到列表，用户会以为功能坏了。
 * 这里统一给一个真实列表页：歌曲清单 + 播放全部 + 单曲下载，
 * 与网易云的「每日推荐 / 我喜欢」保持一致的交互。
 *
 * 1.22.7 补「网易云 私人FM」「酷狗 新歌速递」两个入口。
 */

export type PlatformSongKind =
  | 'tx-daily' | 'tx-liked' | 'tx-home' | 'tx-radar' | 'tx-new' | 'tx-guess'
  | 'kg-daily' | 'kg-liked' | 'kg-new'
  | 'wy-fm'

const LOADERS: Record<PlatformSongKind, () => Promise<LX.Music.MusicInfoOnline[]>> = {
  'tx-daily': getQQDailyRecommend,
  'tx-liked': getQQLikedSongs,
  'tx-home': getQQHomeRecommend,
  'tx-radar': getQQRadarSongs,
  'tx-new': getQQNewSongs,
  'tx-guess': getQQGuessSongs,
  'kg-daily': getKgDailyRecommend,
  'kg-liked': getKgLikedSongs,
  'kg-new': getKgNewSongs,
  'wy-fm': getPersonalFmSongs,
}

export default memo(({ componentId, kind }: { componentId: string, kind: PlatformSongKind }) => {
  const t = useI18n()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.platformSongs, componentId)
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
      case 'kg-new': return { title: t('kg_new_songs'), emptyTip: t('kg_new_empty') }
      case 'wy-fm': return { title: t('netease_personal_fm'), emptyTip: t('netease_personal_fm_empty') }
      default: return { title: t('kg_liked'), emptyTip: t('kg_liked_empty') }
    }
  }, [kind, t])

  // QQ 推荐类接口在未登录时也会返回通用推荐（实测 36 首），
  // 所以只有「我喜欢」这类真正依赖账号的入口才拦登录。
  const needLogin = kind == 'tx-liked' || kind == 'kg-liked'
  const loggedIn = kind.startsWith('kg-')
    ? isKgLoggedIn()
    : kind.startsWith('wy-') ? true : isQQLoggedIn()

  return (
    <SongListView
      componentId={componentId}
      title={title}
      listKey={`platform_${kind}`}
      loader={LOADERS[kind]}
      requireLogin={needLogin}
      loggedIn={needLogin ? loggedIn : true}
      emptyTip={emptyTip}
    />
  )
})
