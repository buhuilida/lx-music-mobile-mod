import { memo, useCallback, useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import WyLoginModal from '@/components/WyLoginModal'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useNetease } from '@/store/netease/hook'
import { createStyle, toast } from '@/utils/tools'
import { initNetease, isNeteaseLoggedIn, logoutNetease } from '@/core/netease'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import {
  pushCloudDiskScreen,
  pushDailyRecScreen,
  pushFollowedArtistsScreen,
  pushLikedSongsScreen,
  pushMyPlaylistsScreen,
  pushPlatformSettingScreen,
} from '@/navigation'

const VIP_LABEL: Record<number, string> = {
  10: '音乐包',
  11: '黑胶 VIP',
  12: '黑胶 SVIP',
}

/**
 * 我的音乐（网易账号中心，1.20.0）
 *
 * Walnut 分支里的每日推荐 / 关注歌手 / 云盘 / 我的歌单都挂在这里，
 * 侧边栏只放一个入口，避免菜单被十几个条目撑爆。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const { profile, followedArtists, cloudCount, loading } = useNetease()
  const [loginVisible, setLoginVisible] = useState(false)
  const loggedIn = isNeteaseLoggedIn()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.neteaseMine, componentId)
  }, [componentId])

  useEffect(() => {
    if (!loggedIn) return
    void initNetease().catch(() => {})
  }, [loggedIn])

  const handleLogout = useCallback(() => {
    void logoutNetease().then(() => {
      toast(t('wy_logout_done'))
    })
  }, [t])

  const entries = [
    { key: 'daily', icon: 'music_time', title: t('netease_daily'), desc: t('netease_daily_desc'), onPress: () => { pushDailyRecScreen(componentId) } },
    { key: 'followed', icon: 'album', title: t('netease_followed'), desc: t('netease_followed_desc', { count: followedArtists.length }), onPress: () => { pushFollowedArtistsScreen(componentId) } },
    { key: 'cloud', icon: 'add-music', title: t('netease_cloud'), desc: t('netease_cloud_desc', { count: cloudCount }), onPress: () => { pushCloudDiskScreen(componentId) } },
    { key: 'playlists', icon: 'list-order', title: t('netease_my_playlists'), desc: t('netease_my_playlists_desc'), onPress: () => { pushMyPlaylistsScreen(componentId) } },
    { key: 'liked', icon: 'play-outline', title: t('netease_liked'), desc: t('netease_liked_desc'), onPress: () => { pushLikedSongsScreen(componentId) } },
  ] as const

  return (
    <PageContent>
      <FullScreenHeader componentId={componentId} title={t('netease_mine')} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={[styles.card, { backgroundColor: theme['c-content-background'] }]}>
          {
            loggedIn
              ? <>
                  <View style={styles.profileRow}>
                    <Image url={profile.avatarUrl} style={styles.avatar} />
                    <View style={styles.profileInfo}>
                      <View style={styles.nameRow}>
                        <Text size={16} numberOfLines={1} style={styles.nickname}>{profile.nickname || t('netease_unknown_user')}</Text>
                        {profile.vipType
                          ? <View style={[styles.vipBadge, { borderColor: theme['c-primary-font'] }]}>
                              <Text size={9} color={theme['c-primary-font']}>{VIP_LABEL[profile.vipType] ?? 'VIP'}</Text>
                            </View>
                          : null}
                      </View>
                      <Text size={11} color={theme['c-font-label']} style={styles.profileSub} numberOfLines={1}>
                        {t('netease_profile_stat', { follows: profile.follows ?? 0, followeds: profile.followeds ?? 0 })}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => { void initNetease(true).catch((err: Error) => { toast(err.message, 'long') }) }} style={styles.iconBtn} disabled={loading}>
                      <Icon name="list-loop" size={16} color={theme['c-font-label']} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: theme['c-border-background'] }]} onPress={() => { pushPlatformSettingScreen(componentId) }} activeOpacity={0.7}>
                      <Text size={12}>{t('netease_manage_cookie')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: theme['c-border-background'] }]} onPress={handleLogout} activeOpacity={0.7}>
                      <Text size={12} color={theme['c-font-label']}>{t('netease_logout')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              : <>
                  <View style={styles.loginHead}>
                    <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}>
                      <Text size={22} color={theme['c-primary-light-400-alpha-200']}>WY</Text>
                    </View>
                    <View style={styles.profileInfo}>
                      <Text size={15}>{t('netease_not_login')}</Text>
                      <Text size={11} color={theme['c-font-label']} style={styles.profileSub} numberOfLines={2}>
                        {t('netease_not_login_desc')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: theme['c-primary-background'] }]}
                      onPress={() => { setLoginVisible(true) }}
                      activeOpacity={0.75}
                    >
                      <Text size={13} color={theme['c-primary-font']}>{t('wy_login_scan')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: theme['c-border-background'] }]}
                      onPress={() => { pushPlatformSettingScreen(componentId) }}
                      activeOpacity={0.7}
                    >
                      <Text size={12}>{t('netease_paste_cookie')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
          }
        </View>

        {entries.map(item => (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.7}
            style={[styles.entry, { backgroundColor: theme['c-content-background'] }]}
            onPress={() => {
              if (!loggedIn) {
                setLoginVisible(true)
                return
              }
              item.onPress()
            }}
          >
            <View style={[styles.entryIcon, { backgroundColor: theme['c-primary-light-900-alpha-200'] }]}>
              <Icon name={item.icon} size={17} color={theme['c-primary-font']} />
            </View>
            <View style={styles.entryContent}>
              <Text size={14}>{item.title}</Text>
              <Text size={11} color={theme['c-font-label']} style={styles.entrySub} numberOfLines={1}>{item.desc}</Text>
            </View>
            <Icon name="chevron-right" size={14} color={theme['c-350']} />
          </TouchableOpacity>
        ))}

        <Text size={11} color={theme['c-350']} style={styles.footTip}>{t('netease_foot_tip')}</Text>
      </ScrollView>

      <WyLoginModal
        visible={loginVisible}
        onClose={() => { setLoginVisible(false) }}
        onSuccess={() => { void initNetease(true).catch(() => {}) }}
      />
    </PageContent>
  )
})

const styles = createStyle({
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 30,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 12,
    paddingRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nickname: {
    flexShrink: 1,
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
  profileSub: {
    marginTop: 4,
    lineHeight: 16,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 7,
    paddingBottom: 7,
  },
  primaryBtn: {
    borderRadius: 16,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginTop: 10,
  },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryContent: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 12,
    paddingRight: 8,
  },
  entrySub: {
    marginTop: 3,
  },
  footTip: {
    marginTop: 16,
    lineHeight: 16,
    textAlign: 'center',
  },
})
