declare namespace LX {
  namespace ListenTogether {
    /**
     * 一起听连接状态
     */
    type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

    /**
     * 歌曲同步状态
     */
    type SyncStatus = 'idle' | 'syncing' | 'synced' | 'failed'

    interface Member {
      id: string
      nickname: string
      isHost: boolean
      online: boolean
      joinedAt: number
    }

    /**
     * 用于在房间内同步的歌曲信息
     */
    interface MusicSnapshot {
      id: string
      source: LX.Source
      name: string
      singer: string
      album: string
      interval: string | null
      picUrl: string | null
      /**
       * 在线歌曲的完整信息，成员端可以直接用它取播放地址
       * 本地歌曲或者信息不完整时为 null，此时成员端会根据歌名、歌手搜索同名歌曲
       */
      musicInfo: LX.Music.MusicInfoOnline | null
      /**
       * 房主当前可播放的音频直链，供网页版直接播放
       * 本地文件 / 取不到直链 / 音源不允许外链时为 null
       */
      url?: string | null
    }

    /**
     * 房间内统一使用的歌词，由房主推送
     * 成员端直接使用这份歌词，避免不同音源拿到的歌词/时间轴不一致
     */
    interface LyricSnapshot {
      musicId: string
      source: LX.Source
      name: string
      singer: string
      lrc: string
      tlrc: string
      rlrc: string
      at: number
    }

    /**
     * 房间内的播放状态，由房主产生
     */
    interface PlaybackState {
      music: MusicSnapshot | null
      isPlaying: boolean
      /**
       * 生成该状态时歌曲的播放进度（秒）
       */
      position: number
      /**
       * 播放速度
       */
      playRate: number
      /**
       * 房间统一音质（房主的播放音质），成员按这个音质取播放地址
       */
      quality?: LX.Quality | null
      /**
       * 状态生成时间（毫秒时间戳）
       */
      sentAt: number
    }

    interface ChatMessage {
      id: string
      type: 'user' | 'system'
      senderId: string
      senderName: string
      text: string
      /**
       * 系统消息的多语言 key，客户端用它生成对应语言的文案
       */
      key?: string
      params?: Record<string, string>
      at: number
    }

    interface Room {
      id: string
      code: string
      name: string
      hostId: string
      members: Member[]
      state: PlaybackState | null
      /**
       * 当前播放状态的来源成员，空表示房主；
       * 允许成员成为播放源（网页建房、App 加入后播放的场景）
       */
      stateSourceId?: string | null
      /**
       * 房主当前歌曲的歌词，后加入的成员也能直接拿到
       */
      lyric?: LyricSnapshot | null
      createdAt: number
    }

    interface CreateRoomOptions {
      nickname: string
      roomName?: string
      password?: string
    }

    interface JoinRoomOptions {
      code: string
      nickname: string
      password?: string
    }

    type ClientMessage =
      | {
        type: 'create'
        clientId: string
        nickname: string
        roomName?: string
        password?: string
      }
      | {
        type: 'join'
        clientId: string
        nickname: string
        code: string
        password?: string
        /**
         * 重连凭证，用于恢复自己在房间中的成员身份
         */
        token?: string
      }
      | {
        type: 'leave'
      }
      | {
        type: 'state'
        state: PlaybackState
      }
      | {
        type: 'chat'
        text: string
      }
      | {
        type: 'lyric'
        lyric: Omit<LyricSnapshot, 'at'>
      }
      | {
        type: 'control'
        action: 'play' | 'pause' | 'seek'
        /**
         * 目标进度（秒），action 为 seek 时必填
         */
        position?: number
      }
      | {
        type: 'transferHost'
        targetId: string
      }
      | {
        type: 'ping'
        at: number
      }

    type ServerMessage =
      | {
        type: 'room'
        room: Room
        selfId: string
        /**
         * 自己在房间中的重连凭证
         */
        token?: string
      }
      | {
        type: 'members'
        members: Member[]
        hostId: string
      }
      | {
        type: 'state'
        state: PlaybackState | null
        from: string
        /**
         * 播放状态来源成员 id（播放源成员上报时与 from 相同）
         */
        sourceId?: string
      }
      | {
        type: 'chat'
        message: ChatMessage
      }
      | {
        type: 'lyric'
        lyric: LyricSnapshot
        from: string
      }
      | {
        type: 'control'
        action: 'play' | 'pause' | 'seek'
        position?: number
        from: string
        name: string
      }
      | {
        type: 'error'
        code: string
        message: string
      }
      | {
        type: 'kicked'
        reason: string
      }
      | {
        type: 'pong'
        at: number
        serverTime: number
      }
  }
}
