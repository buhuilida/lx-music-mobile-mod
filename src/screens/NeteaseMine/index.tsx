import { memo, useCallback, useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import WebLoginModal from '@/components/WebLoginModal'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useNetease } from '@/store/netease/hook'
import { useKgAccount, useTxAccount } from '@/store/account/hook'
import { useSettingValue } from '@/store/setting/hook'
import { verifyAccount, type AccountStatus } from '@/core/accountStatus'
import { createStyle, toast } from '@/utils/tools'
import { friendlyError } from '@/utils/errorMsg'
import playerState from '@/store/player/state'
import { initNetease, isNeteaseLoggedIn, logoutNetease, getHeartbeatSongs } from '@/core/netease'
import { initQQ, isQQLoggedIn, logoutQQ } from '@/core/qq'
import { isKgLoggedIn, logoutKg } from '@/core/kugou'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { COMPONENT_IDS, LIST_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import {
  pushCloudDiskScreen,
  pushDailyRecScreen,
  pushFollowedArtistsScreen,
  pushLikedSongsScreen,
  pushMyPlaylistsScreen,
  pushNeteaseAlbumsScreen,
  pushPlatformListScreen,
  pushPlatformSettingScreen,
  pushPlatformSongsScreen,
  pushWebDAVScreen,
} from '@/navigation'

const VIP_LABEL: Record<number, string> = {
  10: '音乐包',
  11: '黑胶 VIP',
  12: '黑胶 SVIP',
}

type PlatformKey = 'tx' | 'wy' | 'kg'

const PLATFORMS: Array<{ key: PlatformKey, name: string, color: string, icon: string }> = [
  { key: 'tx', name: 'QQ音乐', color: '#31c27c', icon: 'music_time' },
  { key: 'wy', name: '网易云', color: '#e8342c', icon: 'album' },
  { key: 'kg', name: '酷狗音乐', color: '#2b9cf7', icon: 'leaderboard' },
]

interface EntryItem {
  key: string
  icon: string
  title: string
  desc: string
  /** 该入口是否必须登录；不填表示公开内容，未登录也能看 */
  needLogin?: boolean
  onPress: () => void
}

/**
 * 我的音乐（三平台账号中心，1.22.0）
 *
 * 版式对齐参考 App：顶部三平台切换，下面是账号状态 + 两列功能卡片。
 * - QQ 音乐 / 酷狗的能力来自从 APK 还原的签名与接口
 * - 点卡片直接把歌曲塞进临时列表播放，不额外跳一堆中间页
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const { profile, followedArtists, cloudCount, loading } = useNetease()
  const txAccount = useTxAccount()
  const kgAccount = useKgAccount()
  /** 网页登录：三平台统一，不再有手机号 / 扫码 */
  const [webLogin, setWebLogin] = useState<PlatformKey | null>(null)
  const [platform, setPlatform] = useState<PlatformKey>('wy')

  const wyLoggedIn = isNeteaseLoggedIn()
  const txLoggedIn = isQQLoggedIn()
  const kgLoggedIn = isKgLoggedIn()

  /**
   * QQ 的本地判定只能说明「Cookie 里有凭证」，凭证可能已经失效
   * （网页登录更容易出现只写了 p_skey 的情况）。
   * 这里补一次真实校验，让「已失效」能明确显示出来，而不是点进去一片报错。
   */
  const txCookie = useSettingValue('platform.txCookie')
  const [txVerify, setTxVerify] = useState<AccountStatus | ''>('')

  useEffect(() => {
    if (!txLoggedIn) {
      setTxVerify('')
      return
    }
    let alive = true
    setTxVerify('checking')
    void verifyAccount('tx').then((snap) => {
      if (alive) setTxVerify(snap.status)
    }).catch(() => {
      if (alive) setTxVerify('error')
    })
    return () => { alive = false }
  }, [txLoggedIn, txCookie])

  /** 明确失效才算没登录；网络原因校验失败不要误判成未登录 */
  const txUsable = txLoggedIn && txVerify != 'expired'

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseMine, componentId)
  }, [componentId])

  useEffect(() => {
    if (wyLoggedIn) void initNetease().catch(() => {})
  }, [wyLoggedIn])

  useEffect(() => {
    if (txLoggedIn) void initQQ().catch(() => {})
  }, [txLoggedIn])

  const handleLogout = useCallback(() => {
    const platformName = platform == 'tx' ? t('platform_name_tx') : platform == 'kg' ? t('platform_name_kg') : t('platform_name_wy')
    if (platform == 'tx') {
      void logoutQQ().then(() => { toast(t('platform_logout_done', { platform: platformName })) })
      return
    }
    if (platform == 'kg') {
      void logoutKg().then(() => { toast(t('platform_logout_done', { platform: platformName })) })
      return
    }
    void logoutNetease().then(() => {
      toast(t('platform_logout_done', { platform: platformName }))
    })
  }, [platform, t])

  /**
   * 心动模式：生成一串相似推荐直接播
   *
   * 正在放网易云的歌就用它当种子；否则交给 core 从「我喜欢的音乐」里随机挑一首。
   * 之前这里强制要求「当前播放必须是网易云歌曲」，从「我的音乐」入口点进来时
   * 十有八九不满足，于是要么弹「先播放一首网易云的歌」，要么带着空种子去请求
   * 再失败。lxx 的心动模式入口也是从「我喜欢的音乐」随机取种子，这里对齐。
   */
  const handleHeartbeat = useCallback(() => {
    const info = playerState.playMusicInfo.musicInfo
    const online = info && 'source' in info ? info : null
    const rawId = online && online.source == 'wy'
      ? String(online.meta?.songId ?? online.id).replace(/^wy_/, '')
      : ''
    toast(t('netease_heartbeat_loading'), 'short')
    void getHeartbeatSongs(rawId || undefined)
      .then(async(list) => {
        if (!list.length) {
          toast(t('netease_heartbeat_empty'))
          return
        }
        await setTempList(LIST_IDS.TEMP, list)
        await playList(LIST_IDS.TEMP, 0)
      })
      .catch((err: Error) => { toast(friendlyError(err), 'long') })
  }, [t])

  const wyEntries: EntryItem[] = [
    { key: 'daily', icon: 'music_time', title: t('netease_daily'), desc: t('netease_daily_desc'), needLogin: true, onPress: () => { pushDailyRecScreen(componentId) } },
    { key: 'liked', icon: 'love', title: t('netease_liked'), desc: t('netease_liked_desc'), needLogin: true, onPress: () => { pushLikedSongsScreen(componentId) } },
    { key: 'playlists', icon: 'list-order', title: t('netease_my_playlists'), desc: t('netease_my_playlists_desc'), needLogin: true, onPress: () => { pushMyPlaylistsScreen(componentId) } },
    { key: 'subPlaylists', icon: 'album', title: t('netease_sub_playlists'), desc: t('netease_sub_playlists_desc'), needLogin: true, onPress: () => { pushMyPlaylistsScreen(componentId, { onlySubscribed: true }) } },
    { key: 'heartbeat', icon: 'play-outline', title: t('netease_heartbeat'), desc: t('netease_heartbeat_desc'), needLogin: true, onPress: handleHeartbeat },
    { key: 'subAlbums', icon: 'album', title: t('netease_sub_albums'), desc: t('netease_sub_albums_desc'), needLogin: true, onPress: () => { pushNeteaseAlbumsScreen(componentId, 'sub') } },
    { key: 'followed', icon: 'music_time', title: t('netease_followed'), desc: t('netease_followed_desc', { count: followedArtists.length }), needLogin: true, onPress: () => { pushFollowedArtistsScreen(componentId) } },
    { key: 'personalFm', icon: 'play', title: t('netease_personal_fm'), desc: t('netease_personal_fm_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'wy-fm') } },
    { key: 'newAlbums', icon: 'available_updates', title: t('netease_new_albums'), desc: t('netease_new_albums_desc'), needLogin: true, onPress: () => { pushNeteaseAlbumsScreen(componentId, 'new') } },
    { key: 'cloud', icon: 'add-music', title: t('netease_cloud'), desc: t('netease_cloud_desc', { count: cloudCount }), needLogin: true, onPress: () => { pushCloudDiskScreen(componentId) } },
  ]

  const txEntries: EntryItem[] = [
    { key: 'daily', icon: 'music_time', title: t('qq_daily'), desc: t('qq_daily_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'tx-daily') } },
    { key: 'liked', icon: 'love', title: t('qq_liked'), desc: t('qq_liked_desc'), needLogin: true, onPress: () => { pushPlatformSongsScreen(componentId, 'tx-liked') } },
    { key: 'playlists', icon: 'list-order', title: t('qq_my_playlists'), desc: t('qq_my_playlists_desc'), needLogin: true, onPress: () => { pushPlatformListScreen(componentId, 'tx-mine') } },
    { key: 'favPlaylists', icon: 'album', title: t('qq_fav_playlists'), desc: t('qq_fav_playlists_desc'), needLogin: true, onPress: () => { pushPlatformListScreen(componentId, 'tx-fav') } },
    { key: 'favAlbums', icon: 'album', title: t('qq_fav_albums'), desc: t('qq_fav_albums_desc'), needLogin: true, onPress: () => { pushPlatformListScreen(componentId, 'tx-album') } },
    { key: 'home', icon: 'album', title: t('qq_home_recommend'), desc: t('qq_home_recommend_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'tx-home') } },
    { key: 'radar', icon: 'leaderboard', title: t('qq_radar'), desc: t('qq_radar_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'tx-radar') } },
    { key: 'recommendPlaylists', icon: 'album', title: t('qq_songlist_recommend'), desc: t('qq_songlist_recommend_desc'), onPress: () => { pushPlatformListScreen(componentId, 'tx-recommend') } },
    { key: 'newSongs', icon: 'available_updates', title: t('qq_new_songs'), desc: t('qq_new_songs_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'tx-new') } },
    { key: 'guess', icon: 'love', title: t('qq_guess'), desc: t('qq_guess_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'tx-guess') } },
  ]

  const kgEntries: EntryItem[] = [
    { key: 'daily', icon: 'music_time', title: t('kg_daily'), desc: t('kg_daily_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'kg-daily') } },
    { key: 'liked', icon: 'love', title: t('kg_liked'), desc: t('kg_liked_desc'), needLogin: true, onPress: () => { pushPlatformSongsScreen(componentId, 'kg-liked') } },
    { key: 'playlists', icon: 'list-order', title: t('kg_my_playlists'), desc: t('kg_my_playlists_desc'), needLogin: true, onPress: () => { pushPlatformListScreen(componentId, 'kg-mine') } },
    { key: 'favPlaylists', icon: 'album', title: t('kg_fav_playlists'), desc: t('kg_fav_playlists_desc'), needLogin: true, onPress: () => { pushPlatformListScreen(componentId, 'kg-fav') } },
    { key: 'newSongs', icon: 'available_updates', title: t('kg_new_songs'), desc: t('kg_new_songs_desc'), onPress: () => { pushPlatformSongsScreen(componentId, 'kg-new') } },
    { key: 'songRecommend', icon: 'album', title: t('kg_song_recommend'), desc: t('kg_song_recommend_desc'), onPress: () => { pushPlatformListScreen(componentId, 'kg-recommend') } },
  ]

  const current = PLATFORMS.find(item => item.key == platform)!
  const loggedIn = platform == 'wy' ? wyLoggedIn : platform == 'tx' ? txUsable : kgLoggedIn
  const entries = platform == 'wy' ? wyEntries : platform == 'tx' ? txEntries : kgEntries
  const nickname = platform == 'wy'
    ? profile.nickname
    : platform == 'tx' ? txAccount.nickname : kgAccount.nickname
  const avatar = platform == 'wy' ? profile.avatarUrl : platform == 'tx' ? txAccount.avatar : kgAccount.avatar
  const loadingNow = platform == 'wy' ? loading : platform == 'tx' ? txAccount.loading : kgAccount.loading
  /** QQ 已保存 Cookie 但服务端不认：显示「已失效」而不是「未登录」 */
  const expired = platform == 'tx' && txLoggedIn && txVerify == 'expired'

  return (
    <PageContent>
      <FullScreenHeader componentId={componentId} title={t('netease_mine')} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 平台切换 */}
        <View style={styles.platformRow}>
          {
            PLATFORMS.map(item => {
              const active = item.key == platform
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.75}
                  onPress={() => { setPlatform(item.key) }}
                  style={[
                    styles.platformCard,
                    {
                      backgroundColor: active ? theme['c-primary-light-900-alpha-200'] : theme['c-content-background'],
                      borderColor: active ? theme['c-primary-font'] : 'transparent',
                    },
                  ]}
                >
                  <View style={[styles.platformIcon, { backgroundColor: item.color }]}>
                    <Icon name={item.icon} size={13} color="#fff" />
                  </View>
                  <Text size={12} color={active ? theme['c-primary-font'] : undefined}>{item.name}</Text>
                </TouchableOpacity>
              )
            })
          }
        </View>

        {/* 当前平台账号状态 */}
        <View style={[styles.accountRow, { backgroundColor: theme['c-content-background'] }]}>
          <View style={styles.accountInfo}>
            <View style={styles.nameRow}>
              <Text size={15}>{current.name}</Text>
              <Icon name="chevron-right-2" size={12} color={theme['c-350']} style={styles.nameArrow} />
              {platform == 'wy' && loggedIn && profile.vipType
                ? <View style={[styles.vipBadge, { borderColor: theme['c-primary-font'] }]}>
                    <Text size={9} color={theme['c-primary-font']}>{VIP_LABEL[profile.vipType] ?? 'VIP'}</Text>
                  </View>
                : null}
            </View>
            <Text size={11} color={theme['c-font-label']} style={styles.accountSub} numberOfLines={1}>
              {expired
                ? t('platform_account_expired', { name: current.name })
                : loggedIn
                  ? (nickname || t('netease_unknown_user'))
                  : (platform == 'wy' ? t('netease_not_login') : t('platform_not_login', { name: current.name }))}
            </Text>
          </View>

          {
            loggedIn
              ? <View style={styles.accountActions}>
                  {platform == 'wy'
                    ? <TouchableOpacity
                        style={styles.iconBtn}
                        disabled={loadingNow}
                        onPress={() => { void initNetease(true).catch((err: Error) => { toast(friendlyError(err), 'long') }) }}
                      >
                        <Icon name="list-loop" size={16} color={theme['c-font-label']} />
                      </TouchableOpacity>
                    : null}
                  {avatar
                    ? <TouchableOpacity onPress={handleLogout} activeOpacity={0.8}>
                        <Image url={avatar} style={styles.avatar} />
                      </TouchableOpacity>
                    : <TouchableOpacity onPress={handleLogout} activeOpacity={0.8} style={styles.iconBtn}>
                        <Icon name="exit2" size={16} color={theme['c-font-label']} />
                      </TouchableOpacity>}
                </View>
              : <TouchableOpacity
                  style={[styles.loginBtn, { backgroundColor: theme['c-primary-background'] }]}
                  onPress={() => { setWebLogin(platform) }}
                  activeOpacity={0.8}
                >
                  <Text size={12} color={theme['c-primary-font']}>{t('kg_login')}</Text>
                </TouchableOpacity>
          }
        </View>

        {/* 功能卡片 */}
        <View style={styles.grid}>
          {
            entries.map(item => (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.7}
                style={[styles.entry, { backgroundColor: theme['c-content-background'] }]}
                onPress={() => {
                  // 只有真正依赖账号的入口才拦登录；推荐类内容官方本就公开
                  if (item.needLogin && !loggedIn) {
                    setWebLogin(platform)
                    return
                  }
                  item.onPress()
                }}
              >
                <View style={styles.entryHead}>
                  <View style={[styles.entryIcon, { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}>
                    <Icon name={item.icon} size={16} color={theme['c-primary-font']} />
                  </View>
                  <Icon name="chevron-right" size={13} color={theme['c-350']} />
                </View>
                <Text size={14} style={styles.entryTitle}>{item.title}</Text>
                <Text size={10} color={theme['c-font-label']} numberOfLines={1} style={styles.entrySub}>{item.desc}</Text>
              </TouchableOpacity>
            ))
          }
        </View>

        {/* WebDAV 云盘（1.23.0）：把网盘当音乐库，与平台账号无关 */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.cloudEntry, { backgroundColor: theme['c-content-background'] }]}
          onPress={() => { pushWebDAVScreen(componentId) }}
        >
          <View style={[styles.entryIcon, { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}>
            <Icon name="sd-card" size={16} color={theme['c-primary-font']} />
          </View>
          <View style={styles.cloudText}>
            <Text size={14}>{t('webdav_title')}</Text>
            <Text size={10} color={theme['c-font-label']} numberOfLines={1}>{t('webdav_entry_desc')}</Text>
          </View>
          <Icon name="chevron-right" size={15} color={theme['c-350']} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { pushPlatformSettingScreen(componentId) }} activeOpacity={0.7}>
          <Text size={11} color={theme['c-350']} style={styles.footTip}>{t('netease_foot_tip')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <WebLoginModal
        visible={webLogin != null}
        platform={webLogin ?? 'wy'}
        onClose={() => { setWebLogin(null) }}
        onSuccess={() => {
          if (webLogin == 'wy') void initNetease(true).catch(() => {})
          if (webLogin == 'tx') void initQQ(true).catch(() => {})
        }}
      />
    </PageContent>
  )
})

const styles = createStyle({
  cloudEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 16,
    marginRight: 16,
    marginTop: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 8,
  },
  cloudText: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 30,
  },
  platformRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 8,
  },
  platformCard: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  platformIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  accountInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameArrow: {
    marginLeft: 4,
  },
  vipBadge: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 4,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 1,
    paddingBottom: 1,
  },
  accountSub: {
    marginTop: 5,
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 4,
  },
  loginBtn: {
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 7,
    paddingBottom: 7,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  entry: {
    width: '48.6%',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTitle: {
    marginTop: 10,
  },
  entrySub: {
    marginTop: 4,
  },
  footTip: {
    marginTop: 16,
    lineHeight: 16,
    textAlign: 'center',
  },
})
