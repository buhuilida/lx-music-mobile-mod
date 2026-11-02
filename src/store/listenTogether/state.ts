export interface InitState {
  /**
   * 连接状态
   */
  status: LX.ListenTogether.ConnectionStatus
  /**
   * 连接错误信息
   */
  errorMessage: string
  /**
   * 当前加入的房间
   */
  room: LX.ListenTogether.Room | null
  /**
   * 自己的成员 id
   */
  selfId: string
  /**
   * 自己是否是房主
   */
  isHost: boolean
  /**
   * 房间内的聊天消息
   */
  messages: LX.ListenTogether.ChatMessage[]
  /**
   * 歌曲同步状态
   */
  syncStatus: LX.ListenTogether.SyncStatus
  /**
   * 同步状态描述
   */
  syncText: string
  /**
   * 当前播放的歌曲是否来自房间同步
   */
  isRemoteMusic: boolean
  /**
   * 上次收到房间播放状态的时间
   */
  lastSyncAt: number
  /**
   * 房间的播放状态（成员视角为房主下发的状态，房主视角为本地状态）
   */
  playback: LX.ListenTogether.PlaybackState | null
  /**
   * 房间当前同步的歌词（由房主推送）
   */
  lyric: LX.ListenTogether.LyricSnapshot | null
  /**
   * 当前播放状态的来源成员 id（空 = 房主；等于 selfId 时本机是播放源）
   */
  playbackSourceId: string
}

const state: InitState = {
  status: 'idle',
  errorMessage: '',
  room: null,
  selfId: '',
  isHost: false,
  messages: [],
  syncStatus: 'idle',
  syncText: '',
  isRemoteMusic: false,
  lastSyncAt: 0,
  playback: null,
  lyric: null,
  playbackSourceId: '',
}

export default state
