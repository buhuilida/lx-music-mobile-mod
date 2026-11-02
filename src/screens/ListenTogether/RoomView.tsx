import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image, ScrollView, TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import Input from '@/components/common/Input'
import { useI18n } from '@/lang'
import { clipboardWriteText, confirmDialog, createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { usePlayMusicInfo, useIsPlay, useProgress } from '@/store/player/hook'
import {
  useListenTogetherMessages,
  useListenTogetherRoom,
  useListenTogetherStatus,
  useListenTogetherSync,
  useListenTogetherPlayback,
  useListenTogetherLyric,
} from '@/store/listenTogether/hook'
import { sendChat, transferHost } from '@/core/listenTogether'

const QUICK_MESSAGES = ['listen_together_quick_1', 'listen_together_quick_2', 'listen_together_quick_3', 'listen_together_quick_4'] as const

const QUALITY_NAMES: Record<string, string> = {
  '128k': '128K',
  '192k': '192K',
  '320k': '320K',
  flac: 'FLAC',
  flac24bit: 'FLAC 24bit',
  ape: 'APE',
  wav: 'WAV',
}

const getMusicInfo = (musicInfo: LX.Player.PlayMusic | null) => {
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

/**
 * 卡片表面色。
 *
 * 不要用 `c-primary-alpha-100`（它是主色 90% 不透明）当卡片底色：
 * 主色偏深时会变成一整块深灰，而文字仍是主题字体色，直接糊成一片。
 * 这里用「主色最亮/最暗档的半透明色」：浅色主题下是白色蒙层、深色主题下是黑色蒙层，
 * 字体色天然与之反色，任何主题都能看清，也保留自定义背景图的质感。
 */
const useSurface = () => {
  const theme = useTheme()
  return useMemo(() => ({
    card: {
      backgroundColor: theme['c-primary-light-1000-alpha-200'],
      borderColor: theme['c-border-background'],
    },
    chip: {
      backgroundColor: theme['c-primary-alpha-800'],
    },
    button: {
      backgroundColor: theme['c-button-background'],
    },
  }), [theme])
}

/**
 * 当前播放卡片单独抽出来，避免每秒的进度更新导致整个房间页重新渲染
 */
const NowPlayingCard = ({ isHost }: { isHost: boolean }) => {
  const t = useI18n()
  const theme = useTheme()
  const surface = useSurface()
  const { syncStatus, syncText } = useListenTogetherSync()
  const { status } = useListenTogetherStatus()
  const playMusicInfo = usePlayMusicInfo()
  const isPlay = useIsPlay()
  const progress = useProgress()
  const { playback } = useListenTogetherPlayback()
  const lyric = useListenTogetherLyric()

  const musicInfo = getMusicInfo(playMusicInfo.musicInfo)
  // 找不到可播放的歌曲时，展示房主想播放的歌曲，避免显示上一首造成误解
  const pendingMusic = !isHost && syncStatus == 'failed' ? playback?.music : null

  const syncInfo = useMemo(() => {
    if (status == 'reconnecting') return { text: t('listen_together_reconnecting_short'), color: theme['c-font-label'] }
    if (status == 'connecting') return { text: t('listen_together_connecting'), color: theme['c-font-label'] }
    if (status != 'connected') return { text: t('listen_together_disconnected'), color: theme['c-font-label'] }
    if (isHost) return { text: t('listen_together_you_are_host'), color: theme['c-primary'] }
    switch (syncStatus) {
      case 'syncing':
        return { text: syncText ? t('listen_together_syncing_music', { name: syncText }) : t('listen_together_syncing'), color: theme['c-font-label'] }
      case 'failed':
        return { text: t('listen_together_sync_failed'), color: theme['c-font-label'] }
      case 'synced':
        return { text: t('listen_together_synced'), color: theme['c-primary'] }
      default:
        return { text: t('listen_together_waiting'), color: theme['c-font-label'] }
    }
  }, [isHost, status, syncStatus, syncText, t, theme])

  const cover = musicInfo?.meta.picUrl ?? pendingMusic?.picUrl ?? ''

  const roomQuality = playback?.quality ? QUALITY_NAMES[playback.quality] ?? playback.quality : null

  return (
    <View style={{ ...styles.card, ...surface.card }}>
      <View style={styles.cardHeader}>
        <Text size={12} color={theme['c-font-label']}>{t('listen_together_now_playing')}</Text>
        <Text size={11} color={syncInfo.color} numberOfLines={1}>{syncInfo.text}</Text>
      </View>
      {
        (roomQuality != null || lyric?.lrc)
          ? (
            <View style={styles.infoRow}>
              {roomQuality ? <View style={{ ...styles.infoChip, ...surface.chip }}><Text size={10} color={theme['c-font-label']}>{t('listen_together_room_quality', { quality: roomQuality })}</Text></View> : null}
              <View style={{ ...styles.infoChip, ...surface.chip }}><Text size={10} color={lyric?.lrc ? theme['c-primary'] : theme['c-font-label']}>{lyric?.lrc ? t('listen_together_lyric_synced') : t('listen_together_lyric_none')}</Text></View>
            </View>
            )
          : null
      }
      {
        pendingMusic
          ? (
            <>
              <Text size={17} numberOfLines={1} style={styles.musicName}>{pendingMusic.name}</Text>
              <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.musicSinger}>{pendingMusic.singer}</Text>
              <Text size={11} color={theme['c-font-label']}>{t('listen_together_sync_failed_tip')}</Text>
            </>
            )
          : musicInfo
            ? (
              <>
                <View style={styles.musicRow}>
                  {
                    cover
                      ? <Image source={{ uri: cover }} style={styles.cover} />
                      : <View style={{ ...styles.cover, ...surface.chip }} />
                  }
                  <View style={styles.musicContent}>
                    <Text size={17} numberOfLines={1} style={styles.musicName}>{musicInfo.name}</Text>
                    <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{musicInfo.singer}</Text>
                  </View>
                </View>
                <View style={{ ...styles.progressBg, backgroundColor: surface.chip.backgroundColor }}>
                  <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary'], width: `${Math.min(progress.progress * 100, 100)}%` }} />
                </View>
                <View style={styles.progressRow}>
                  <Text size={10} color={theme['c-font-label']}>{progress.nowPlayTimeStr}</Text>
                  <Text size={10} color={theme['c-font-label']}>
                    {`${isPlay ? t('listen_together_playing') : t('listen_together_paused')}  ${progress.maxPlayTimeStr}`}
                  </Text>
                </View>
              </>
              )
            : <Text size={13} color={theme['c-font-label']}>{t('listen_together_no_music')}</Text>
      }
    </View>
  )
}

const MemberItem = ({ member, isHost, canTransfer, onPress }: {
  member: LX.ListenTogether.Member
  isHost: boolean
  canTransfer: boolean
  onPress: (member: LX.ListenTogether.Member) => void
}) => {
  const theme = useTheme()
  const surface = useSurface()
  const t = useI18n()
  return (
    <TouchableOpacity
      style={{ ...styles.member, ...surface.chip, opacity: member.online ? 1 : 0.5 }}
      disabled={!canTransfer}
      onPress={() => { onPress(member) }}
      activeOpacity={0.6}
    >
      <View style={{ ...styles.avatar, backgroundColor: isHost ? theme['c-primary'] : theme['c-primary-alpha-700'] }}>
        <Text size={13} color={isHost ? theme['c-primary-light-1000'] : theme['c-font']}>
          {member.nickname.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text size={13} numberOfLines={1}>{member.nickname}</Text>
        <Text size={10} color={theme['c-font-label']} numberOfLines={1}>
          {isHost ? t('listen_together_host') : t('listen_together_member')}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const surface = useSurface()
  const { room, selfId, isHost } = useListenTogetherRoom()
  const messages = useListenTogetherMessages()

  const scrollRef = useRef<ScrollView>(null)
  const chatEndRef = useRef<number>(messages.length)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!messages.length || chatEndRef.current == messages.length) return
    chatEndRef.current = messages.length
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true })
    }, 60)
  }, [messages])

  const copyCode = () => {
    if (!room) return
    clipboardWriteText(room.code)
    toast(t('listen_together_code_copied'))
  }

  const handleTransferHost = useCallback((member: LX.ListenTogether.Member) => {
    void confirmDialog({
      message: t('listen_together_transfer_host_tip', { name: member.nickname }),
      confirmButtonText: t('listen_together_transfer_host'),
    }).then(confirm => {
      if (!confirm) return
      transferHost(member.id)
    })
  }, [t])

  const handleSend = () => {
    const message = text.trim()
    if (!message) return
    if (sendChat(message)) setText('')
  }

  const sortedMembers = useMemo(() => {
    if (!room) return []
    return [...room.members].sort((a, b) => {
      if (a.id == room.hostId) return -1
      if (b.id == room.hostId) return 1
      return a.joinedAt - b.joinedAt
    })
  }, [room])

  const onlineCount = useMemo(() => room?.members.filter(member => member.online).length ?? 0, [room])

  if (!room) return null

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ ...styles.card, ...surface.card }}>
          <View style={styles.cardHeader}>
            <Text size={12} color={theme['c-font-label']}>{t('listen_together_room_code')}</Text>
            <Text size={11} color={theme['c-font-label']}>{t('listen_together_member_count', { num: onlineCount })}</Text>
          </View>
          <View style={styles.codeRow}>
            <Text size={30} style={styles.code}>{room.code}</Text>
            <TouchableOpacity onPress={copyCode} style={{ ...styles.copyBtn, ...surface.button }}>
              <Text size={12} color={theme['c-button-font']}>{t('listen_together_copy_code')}</Text>
            </TouchableOpacity>
          </View>
          <Text size={11} color={theme['c-font-label']} style={styles.inviteTip}>{t('listen_together_invite_tip')}</Text>
        </View>

        <NowPlayingCard isHost={isHost} />

        <View style={{ ...styles.card, ...surface.card }}>
          <View style={styles.cardHeader}>
            <Text size={13} style={styles.cardTitle}>{t('listen_together_members')}</Text>
          </View>
          <View style={styles.memberList}>
            {
              sortedMembers.map(member => (
                <MemberItem
                  key={member.id}
                  member={{ ...member, nickname: member.id == selfId ? `${member.nickname} (${t('listen_together_me')})` : member.nickname }}
                  isHost={member.id == room.hostId}
                  canTransfer={isHost && member.id != selfId}
                  onPress={handleTransferHost}
                />
              ))
            }
          </View>
          {
            isHost && room.members.length > 1
              ? <Text size={10} color={theme['c-font-label']} style={styles.memberTip}>{t('listen_together_transfer_host_tip_short')}</Text>
              : null
          }
        </View>

        <View style={{ ...styles.card, ...surface.card, ...styles.chatCard }}>
          <View style={styles.cardHeader}>
            <Text size={13} style={styles.cardTitle}>{t('listen_together_chat')}</Text>
          </View>
          {
            messages.length
              ? messages.map(message => (
                message.type == 'system'
                  ? <Text key={message.id} size={11} color={theme['c-font-label']} style={styles.systemMessage}>{message.text}</Text>
                  : (
                    <View key={message.id} style={{ ...styles.message, ...(message.senderId == selfId ? styles.messageMine : {}) }}>
                      <Text size={11} color={theme['c-font-label']} style={styles.messageSender}>
                        {message.senderId == selfId ? t('listen_together_me') : message.senderName}
                      </Text>
                      <View style={{ ...styles.bubble, ...surface.chip }}>
                        <Text size={13} style={styles.messageText}>{message.text}</Text>
                      </View>
                    </View>
                    )
              ))
              : <Text size={12} color={theme['c-font-label']}>{t('listen_together_no_message')}</Text>
          }
          <View style={styles.quickList}>
            {
              QUICK_MESSAGES.map(key => (
                <TouchableOpacity
                  key={key}
                  style={{ ...styles.quickItem, ...surface.chip }}
                  onPress={() => { if (sendChat(t(key))) toast(t('listen_together_quick_sent'), 'short') }}
                  activeOpacity={0.6}
                >
                  <Text size={12}>{t(key)}</Text>
                </TouchableOpacity>
              ))
            }
          </View>
        </View>
      </ScrollView>

      <View style={{ ...styles.bottomBar, borderTopColor: theme['c-border-background'] }}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder={t('listen_together_chat_placeholder')}
          placeholderTextColor={theme['c-font-label']}
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          style={{ ...styles.chatInput, backgroundColor: theme['c-primary-input-background'] }}
        />
        <TouchableOpacity
          onPress={handleSend}
          style={{ ...styles.sendBtn, ...(text.trim() ? surface.button : surface.chip) }}
        >
          <Text size={13} color={text.trim() ? theme['c-button-font'] : theme['c-font-label']}>{t('listen_together_send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  infoChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardTitle: {
    fontWeight: 'bold',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  code: {
    flex: 1,
    letterSpacing: 4,
    fontWeight: 'bold',
  },
  copyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  inviteTip: {
    lineHeight: 16,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    width: 46,
    height: 46,
    borderRadius: 8,
    marginRight: 10,
  },
  musicContent: {
    flex: 1,
  },
  musicName: {
    marginBottom: 3,
  },
  musicSinger: {
    marginBottom: 12,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  memberList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 18,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '100%',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  memberInfo: {
    flexShrink: 1,
  },
  memberTip: {
    marginTop: 2,
  },
  chatCard: {
    marginBottom: 0,
  },
  message: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  messageMine: {
    alignItems: 'flex-end',
  },
  messageSender: {
    marginBottom: 3,
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: '86%',
  },
  messageText: {
    lineHeight: 20,
  },
  quickList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  quickItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 6,
  },
  systemMessage: {
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    paddingLeft: 12,
    paddingRight: 12,
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
