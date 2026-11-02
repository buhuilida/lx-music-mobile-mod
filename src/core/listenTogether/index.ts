import { toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import ltState from '@/store/listenTogether/state'
import ltActions from '@/store/listenTogether/action'
import { bindPlayerSync, startSyncIfSource, stopHostSync, resetPlayerSync, applyRemoteState, applyRemoteControl } from './playerSync'
import { initLyricSync, applyRemoteLyric, resetLyricSync } from './lyricSync'
import { getListenTogetherErrorText } from './errorText'
import { localizeSystemMessage } from './systemText'
import defaultSetting from '@/config/defaultSetting'
import client from './instance'
import { showChatNotification } from '@/utils/nativeExt'

/**
 * 规范化用户输入的服务器地址
 */
// 去掉末尾斜杠，但要保留 ?sharecode=xxx 这类访问参数
const trimTrailingSlash = (url: string) => {
  const index = url.indexOf('?')
  if (index < 0) return url.replace(/\/+$/, '')
  return url.slice(0, index).replace(/\/+$/, '') + url.slice(index)
}

export const normalizeServerUrl = (url: string) => {
  const serverUrl = url.trim()
  if (!serverUrl) return ''
  const lowerUrl = serverUrl.toLowerCase()
  if (lowerUrl.startsWith('http://')) return trimTrailingSlash(`ws://${serverUrl.slice(7)}`)
  if (lowerUrl.startsWith('https://')) return trimTrailingSlash(`wss://${serverUrl.slice(8)}`)
  if (lowerUrl.startsWith('ws://') || lowerUrl.startsWith('wss://')) return trimTrailingSlash(serverUrl)
  return trimTrailingSlash(`ws://${serverUrl}`)
}

const getServerUrl = () => normalizeServerUrl(settingState.setting['listenTogether.serverUrl'])

const handleRoom = (room: LX.ListenTogether.Room, selfId: string) => {
  ltActions.setRoom(room, selfId)
  // 老服务端没有 stateSourceId 字段：有播放状态时按房主处理
  ltActions.setPlaybackSource(room.stateSourceId ?? (room.state ? room.hostId : ''))
  // 自己是播放源时房间里的 state 就是本机广播出去的，不需要再应用
  if (room.state && ltState.playbackSourceId != selfId) applyRemoteState(room.state, false)
  if (room.hostId == selfId) {
    ltActions.setSyncStatus('synced')
  } else if (!room.state) {
    ltActions.setSyncStatus('idle')
  }
  startSyncIfSource()
}

const handleMembers = (members: LX.ListenTogether.Member[], hostId: string) => {
  ltActions.setMembers(members, hostId)
  startSyncIfSource()
}

/**
 * 清理本地房间状态
 */
const clearRoomState = () => {
  resetPlayerSync()
  resetLyricSync()
  ltActions.reset()
}

/**
 * 退出房间
 * @param isNotify 是否通知服务端
 */
export const handleLeave = (isNotify = true) => {
  if (isNotify) client.leaveRoom()
  else client.destroy()
  clearRoomState()
  ltActions.setStatus('idle')
}

export const leaveRoom = () => {
  handleLeave(true)
}

/**
 * 初始化一起听模块（应用启动时调用）
 */
/**
 * 老版本里内置的临时隧道地址（localhost.run 每次重启都会失效），
 * 启动时自动换成新的公共服务器，用户也可以自己改成自建地址
 */
const migrateServerUrl = () => {
  const current = settingState.setting['listenTogether.serverUrl']
  if (current && !/\.lhr\.life/i.test(current)) return
  updateSetting({
    'listenTogether.serverUrl': defaultSetting['listenTogether.serverUrl'],
    'listenTogether.webUrl': defaultSetting['listenTogether.webUrl'],
  })
}

export const initListenTogether = () => {
  bindPlayerSync()
  initLyricSync()
  migrateServerUrl()

  client.on('status', (status, errorMessage) => {
    ltActions.setStatus(status, errorMessage)
    if (status == 'connected') return
    stopHostSync()
    switch (status) {
      case 'reconnecting':
        ltActions.setSyncStatus('idle')
        break
      case 'error':
        toast(getListenTogetherErrorText(errorMessage || 'network_error'))
        clearRoomState()
        ltActions.setStatus('error', errorMessage)
        break
    }
  })

  client.on('room', (room, selfId) => {
    handleRoom(room, selfId)
    // 后加入的成员：服务端会把当前歌词一起带过来
    if (room.lyric) applyRemoteLyric(room.lyric)
  })

  client.on('members', (members, hostId) => {
    handleMembers(members, hostId)
  })

  client.on('state', (state, from, sourceId) => {
    ltActions.setPlaybackSource(sourceId)
    applyRemoteState(state, from == ltState.selfId || sourceId == ltState.selfId)
  })

  client.on('chat', (message) => {
    ltActions.addMessage(localizeSystemMessage(message))
    // 房间里其他人发的消息：同步弹系统通知（自己发的不提醒）
    if (message.type == 'user' && message.senderId != ltState.selfId && message.text) {
      showChatNotification(
        global.i18n.t('listen_together_chat_notify_title', { name: message.senderName || global.i18n.t('listen_together_member') }),
        message.text,
      )
    }
  })

  client.on('lyric', (lyric) => {
    applyRemoteLyric(lyric)
  })

  // 成员拖动进度 / 播放暂停，由房主执行后统一广播
  client.on('control', (action, position) => {
    applyRemoteControl(action, position)
  })

  client.on('error', (code) => {
    // 房主刚转交时可能还有一条在途的状态消息，忽略这种无害的错误
    if (code == 'not_host' && !ltState.isHost) return
    toast(getListenTogetherErrorText(code))
    // 加入房间失败时回到未加入状态，方便重新输入
    if (!ltState.room) client.leaveRoom()
  })

  client.on('kicked', (reason) => {
    toast(reason || global.i18n.t('listen_together_kicked_tip'))
    clearRoomState()
    ltActions.setStatus('idle')
  })
}

/**
 * 创建房间
 */
export const createRoom = (options: { nickname: string, roomName?: string, password?: string }) => {
  const serverUrl = getServerUrl()
  if (!serverUrl) {
    toast(global.i18n.t('listen_together_server_required'))
    return false
  }
  const nickname = options.nickname.trim()
  if (!nickname) {
    toast(global.i18n.t('listen_together_nickname_required'))
    return false
  }

  const roomName = options.roomName?.trim()
  const password = options.password?.trim()

  clearRoomState()
  ltActions.setStatus('connecting')
  updateSetting({ 'listenTogether.nickname': nickname })
  client.createRoom(serverUrl, {
    nickname,
    roomName: roomName?.length ? roomName : undefined,
    password: password?.length ? password : undefined,
  })
  return true
}

/**
 * 加入房间
 */
export const joinRoom = (options: { code: string, nickname: string, password?: string }) => {
  const serverUrl = getServerUrl()
  if (!serverUrl) {
    toast(global.i18n.t('listen_together_server_required'))
    return false
  }
  const nickname = options.nickname.trim()
  if (!nickname) {
    toast(global.i18n.t('listen_together_nickname_required'))
    return false
  }
  const code = options.code.trim().toUpperCase()
  if (!code) {
    toast(global.i18n.t('listen_together_code_required'))
    return false
  }

  const password = options.password?.trim()

  clearRoomState()
  ltActions.setStatus('connecting')
  updateSetting({ 'listenTogether.nickname': nickname })
  client.joinRoom(serverUrl, {
    code,
    nickname,
    password: password?.length ? password : undefined,
  })
  return true
}

export const sendChat = (text: string) => {
  const message = text.trim()
  if (!message) return false
  if (message.length > 500) {
    toast(global.i18n.t('listen_together_chat_too_long'))
    return false
  }
  return client.sendChat(message)
}

export const transferHost = (targetId: string) => {
  if (!ltState.isHost) return
  client.transferHost(targetId)
}

export const getRoomCode = () => client.code
