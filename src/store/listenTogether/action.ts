import state from './state'

const MAX_MESSAGES = 120

export default {
  setStatus(status: LX.ListenTogether.ConnectionStatus, errorMessage: string = '') {
    if (state.status == status && state.errorMessage == errorMessage) return
    state.status = status
    state.errorMessage = errorMessage

    global.state_event.listenTogetherStatusUpdated(status, errorMessage)
  },
  setRoom(room: LX.ListenTogether.Room | null, selfId?: string) {
    state.room = room
    if (selfId != null) state.selfId = selfId
    if (room) {
      const self = room.members.find(m => m.id == state.selfId)
      state.isHost = self?.isHost ?? room.hostId == state.selfId
    } else {
      state.isHost = false
    }

    global.state_event.listenTogetherRoomUpdated(room, state.selfId, state.isHost)
  },
  setMembers(members: LX.ListenTogether.Member[], hostId: string) {
    if (!state.room) return
    state.room = {
      ...state.room,
      members,
      hostId,
    }
    state.isHost = hostId == state.selfId

    global.state_event.listenTogetherRoomUpdated(state.room, state.selfId, state.isHost)
  },
  setPlayback(playback: LX.ListenTogether.PlaybackState | null) {
    state.playback = playback
    if (playback) state.lastSyncAt = Date.now()

    global.state_event.listenTogetherPlaybackUpdated(playback, state.lastSyncAt)
  },
  setSyncStatus(syncStatus: LX.ListenTogether.SyncStatus, syncText: string = '') {
    if (state.syncStatus == syncStatus && state.syncText == syncText) return
    state.syncStatus = syncStatus
    state.syncText = syncText

    global.state_event.listenTogetherSyncUpdated(syncStatus, syncText)
  },
  setIsRemoteMusic(isRemoteMusic: boolean) {
    if (state.isRemoteMusic == isRemoteMusic) return
    state.isRemoteMusic = isRemoteMusic
  },

  setPlaybackSource(playbackSourceId: string) {
    if (state.playbackSourceId == playbackSourceId) return
    state.playbackSourceId = playbackSourceId
  },
  setLyric(lyric: LX.ListenTogether.LyricSnapshot | null) {
    if (state.lyric?.musicId == lyric?.musicId && state.lyric?.at == lyric?.at) return
    state.lyric = lyric

    global.state_event.listenTogetherLyricUpdated(lyric)
  },
  addMessage(message: LX.ListenTogether.ChatMessage) {
    // 断线重连时服务端会补发最近的消息，按 id 去重
    if (state.messages.some(m => m.id == message.id)) return
    const messages = [...state.messages, message]
    if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES)
    state.messages = messages

    global.state_event.listenTogetherMessagesUpdated(messages)
  },
  setMessages(messages: LX.ListenTogether.ChatMessage[]) {
    state.messages = messages

    global.state_event.listenTogetherMessagesUpdated(messages)
  },
  clearMessages() {
    state.messages = []

    global.state_event.listenTogetherMessagesUpdated([])
  },
  reset() {
    state.room = null
    state.selfId = ''
    state.isHost = false
    state.messages = []
    state.syncStatus = 'idle'
    state.syncText = ''
    state.isRemoteMusic = false
    state.lastSyncAt = 0
    state.playback = null
    state.lyric = null
    state.playbackSourceId = ''

    global.state_event.listenTogetherRoomUpdated(null, '', false)
    global.state_event.listenTogetherMessagesUpdated([])
    global.state_event.listenTogetherSyncUpdated('idle', '')
    global.state_event.listenTogetherPlaybackUpdated(null, 0)
    global.state_event.listenTogetherLyricUpdated(null)
  },
}
