import BackgroundTimer from 'react-native-background-timer'

interface EventMap {
  status: [LX.ListenTogether.ConnectionStatus, string]
  room: [LX.ListenTogether.Room, string, string | undefined]
  members: [LX.ListenTogether.Member[], string]
  state: [LX.ListenTogether.PlaybackState | null, string, string]
  chat: [LX.ListenTogether.ChatMessage]
  lyric: [LX.ListenTogether.LyricSnapshot]
  control: ['play' | 'pause' | 'seek', number | undefined, string]
  error: [string]
  kicked: [string]
}

type Handler = (...args: any[]) => void

type Session =
  | { kind: 'create', options: LX.ListenTogether.CreateRoomOptions }
  | { kind: 'join', options: LX.ListenTogether.JoinRoomOptions }

const HEARTBEAT_INTERVAL = 15_000
const HEARTBEAT_TIMEOUT = 45_000
const MAX_RECONNECT_NUM = 8
const RECONNECT_DELAY_MAX = 15_000

const createClientId = () => `lt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

/**
 * 一起听房间的 WebSocket 客户端
 * 负责连接、心跳、断线重连以及消息收发，不处理播放逻辑
 */
export default class ListenTogetherClient {
  private socket: WebSocket | null = null
  private listeners: Record<string, Set<Handler>> = {}
  private session: Session | null = null
  private url = ''
  private manualClose = false
  private reconnectAttempt = 0
  private hasConnected = false
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private lastReceivedAt = 0
  private roomCode = ''
  private memberToken = ''

  readonly clientId = createClientId()

  on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void) {
    const list = this.listeners[event] ?? (this.listeners[event] = new Set())
    list.add(listener)
    return () => { this.off(event, listener) }
  }

  off<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void) {
    this.listeners[event]?.delete(listener)
  }

  private emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]) {
    this.listeners[event]?.forEach(listener => {
      listener(...args)
    })
  }

  get isConnected() {
    return this.socket != null && this.socket.readyState === 1
  }

  get code() {
    return this.roomCode
  }

  createRoom(url: string, options: LX.ListenTogether.CreateRoomOptions) {
    this.resetSession()
    this.url = url
    this.session = { kind: 'create', options }
    this.manualClose = false
    this.open()
  }

  joinRoom(url: string, options: LX.ListenTogether.JoinRoomOptions) {
    this.resetSession()
    this.url = url
    this.session = { kind: 'join', options }
    this.manualClose = false
    this.open()
  }

  leaveRoom() {
    this.manualClose = true
    this.send({ type: 'leave' })
    this.session = null
    this.roomCode = ''
    this.memberToken = ''
    this.clearReconnect()
    this.closeSocket()
    this.emit('status', 'idle', '')
  }

  sendState(state: LX.ListenTogether.PlaybackState) {
    return this.send({ type: 'state', state })
  }

  sendChat(text: string) {
    return this.send({ type: 'chat', text })
  }

  sendLyric(lyric: Omit<LX.ListenTogether.LyricSnapshot, 'at'>) {
    return this.send({ type: 'lyric', lyric })
  }

  sendControl(action: 'play' | 'pause' | 'seek', position?: number) {
    return this.send({ type: 'control', action, position })
  }

  transferHost(targetId: string) {
    return this.send({ type: 'transferHost', targetId })
  }

  destroy() {
    this.manualClose = true
    this.session = null
    this.clearReconnect()
    this.closeSocket()
  }

  private resetSession() {
    this.clearReconnect()
    this.closeSocket()
    this.roomCode = ''
    this.memberToken = ''
    this.reconnectAttempt = 0
    this.hasConnected = false
  }

  private open() {
    this.closeSocket()
    if (!this.url) {
      this.emit('status', 'error', '')
      return
    }
    this.emit('status', this.reconnectAttempt ? 'reconnecting' : 'connecting', '')

    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch (err) {
      console.log('listen together connect error', err)
      this.emit('error', 'network_error')
      this.handleClose()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      this.lastReceivedAt = Date.now()
      this.reconnectAttempt = 0
      this.hasConnected = true
      this.emit('status', 'connected', '')
      this.startHeartbeat()
      this.sendSession()
    }

    socket.onmessage = (event) => {
      this.lastReceivedAt = Date.now()
      if (typeof event.data == 'string') this.handleMessage(event.data)
    }

    socket.onerror = () => {
      // 连接错误最终会触发 onclose，由 onclose 统一处理重连
    }

    socket.onclose = () => {
      this.handleClose()
    }
  }

  private sendSession() {
    const session = this.session
    if (!session) return
    if (session.kind === 'create') {
      // 已经创建过房间（例如断线重连），改用带 token 的加入请求恢复成员身份
      if (this.roomCode) {
        this.send({
          type: 'join',
          clientId: this.clientId,
          nickname: session.options.nickname,
          code: this.roomCode,
          password: session.options.password,
          token: this.memberToken,
        })
        return
      }
      this.send({
        type: 'create',
        clientId: this.clientId,
        nickname: session.options.nickname,
        roomName: session.options.roomName,
        password: session.options.password,
      })
    } else {
      this.send({
        type: 'join',
        clientId: this.clientId,
        nickname: session.options.nickname,
        code: this.roomCode || session.options.code,
        password: session.options.password,
        token: this.memberToken || undefined,
      })
    }
  }

  private send(message: LX.ListenTogether.ClientMessage) {
    if (!this.isConnected) return false
    try {
      this.socket!.send(JSON.stringify(message))
      return true
    } catch (err) {
      console.log('listen together send error', err)
      return false
    }
  }

  private handleMessage(raw: string) {
    if (typeof raw != 'string' || raw.length > 512 * 1024) return
    let message: LX.ListenTogether.ServerMessage
    try {
      message = JSON.parse(raw) as LX.ListenTogether.ServerMessage
    } catch {
      return
    }
    if (!message || typeof message.type != 'string') return

    switch (message.type) {
      case 'room':
        this.roomCode = message.room.code
        if (message.token) this.memberToken = message.token
        this.emit('room', message.room, message.selfId, message.token)
        break
      case 'members':
        this.emit('members', message.members, message.hostId)
        break
      case 'state':
        this.emit('state', message.state ?? null, message.from ?? '', message.sourceId ?? message.from ?? '')
        break
      case 'chat':
        this.emit('chat', message.message)
        break
      case 'lyric':
        this.emit('lyric', message.lyric)
        break
      case 'control':
        this.emit('control', message.action, message.position, message.name)
        break
      case 'error':
        this.emit('error', message.code)
        break
      case 'kicked':
        this.manualClose = true
        this.session = null
        this.emit('kicked', message.reason)
        this.closeSocket()
        this.emit('status', 'idle', '')
        break
      case 'pong':
      default:
        break
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = BackgroundTimer.setInterval(() => {
      if (Date.now() - this.lastReceivedAt > HEARTBEAT_TIMEOUT) {
        console.log('listen together heartbeat timeout')
        this.closeSocket()
        this.handleClose()
        return
      }
      this.send({ type: 'ping', at: Date.now() })
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return
    BackgroundTimer.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private handleClose() {
    this.stopHeartbeat()
    this.socket = null
    if (this.manualClose || !this.session) {
      this.emit('status', 'idle', '')
      return
    }
    // 从未连接成功时快速失败，避免地址写错时等待过久
    const maxAttempts = this.hasConnected ? MAX_RECONNECT_NUM : 3
    if (this.reconnectAttempt >= maxAttempts) {
      this.emit('status', 'error', 'network_error')
      return
    }
    this.reconnectAttempt++
    this.emit('status', 'reconnecting', '')
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), RECONNECT_DELAY_MAX)
    this.clearReconnect()
    this.reconnectTimer = BackgroundTimer.setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private clearReconnect() {
    if (!this.reconnectTimer) return
    BackgroundTimer.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeSocket() {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    try {
      socket.close()
    } catch (err) {
      console.log('listen together close error', err)
    }
  }
}
