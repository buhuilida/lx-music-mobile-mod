import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import ltState from '@/store/listenTogether/state'
import ltActions from '@/store/listenTogether/action'
import { play, pause, playMusicInfo } from '@/core/player/player'
import { getPosition } from '@/plugins/player'
import { getMusicUrl } from '@/core/music'
import { setQualityOverride } from '@/core/music/online'
import { findMusic } from '@/utils/musicSdk'
import BackgroundTimer from 'react-native-background-timer'
import client from './instance'

const BROADCAST_INTERVAL = 4_000
/** 音频直链缓存时长：部分音源链接会过期，过久复用会导致网页端 403 */
const URL_TTL = 5 * 60 * 1000
/** 取直链最多等这么久，避免拖慢播放状态广播 */
const URL_TIMEOUT = 3_000
const SEEK_THRESHOLD = 3
const SYNC_THRESHOLD = 1.5
const LOAD_APPLY_TIMEOUT = 15_000
/** 成员端刚跟随房主调整过进度/播放状态时，这段时间内不再把本地变化当成用户操作回传 */
const REMOTE_APPLY_QUIET = 1_200
/** 成员端切歌过程中播放器自己产生的状态变化，不算用户操作 */
const SWITCH_QUIET = 2_500
/** 同一种控制指令的最小间隔，避免拖动进度时刷屏 */
const CONTROL_INTERVAL = 500

let isBound = false
let applyingRemote = false
let broadcastTimer: number | null = null
let broadcastDelayTimer: number | null = null
let lastBroadcast = { position: 0, at: 0 }
let switchingKey = ''
let failedKey = ''
let failedAt = 0
let pendingRemote: { state: LX.ListenTogether.PlaybackState, receivedAt: number, localId: string } | null = null
let pendingTimer: number | null = null
let remoteApplyAt = 0
let applyingRemoteControl = false
let remoteControlTimer: number | null = null
let suppressControlUntil = 0
let lastControlAt = 0
const fallbackTried = new Set<string>()
const urlCache = new Map<string, { url: string | null, at: number }>()
const urlPending = new Set<string>()

const getPlayRate = () => settingState.setting['player.playbackRate'] || 1

/**
 * 本机是否是房间的播放源：
 * - 房主天然是播放源
 * - 房间还没有播放状态（或自己已是播放源）时成员也能成为播放源，
 *   典型场景：网页端建房，App 加入后播放歌曲，两端互通歌曲 / 歌词 / 音频
 */
const isPlaybackSource = () => ltState.isHost ||
  ltState.playbackSourceId == ltState.selfId ||
  (ltState.room != null && !ltState.playback)

const canBroadcast = () => isPlaybackSource() && ltState.status == 'connected' && ltState.room != null && !applyingRemote

const canControl = () => !isPlaybackSource() && ltState.status == 'connected' && ltState.room != null

/**
 * 把成员的播放/暂停/拖动进度请求发给房主执行
 * 这样所有人看到的进度、播放状态始终一致，而不是被房主每 4 秒的广播强行拉回去
 */
const sendControl = (action: 'play' | 'pause' | 'seek', position?: number) => {
  if (!canControl()) return
  const now = Date.now()
  if (now - lastControlAt < CONTROL_INTERVAL) return
  lastControlAt = now
  client.sendControl(action, position)
}

const markRemoteApplied = () => {
  remoteApplyAt = Date.now()
}


const getMusicInfo = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem | null): LX.Music.MusicInfo | null => {
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

/**
 * 网页版通常跑在 https 下，http 直链会被浏览器当成混合内容拦截。
 * 音源一般同时支持 https，先探一下（HEAD），不通再用原地址。
 */
const upgradeToHttps = async(url: string) => {
  if (!url.startsWith('http://')) return url
  const candidate = `https://${url.slice(7)}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 1200)
    const response = await fetch(candidate, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    if (response.ok || response.status == 206) return candidate
  } catch {}
  return url
}

const getPlayableUrl = async(info: LX.Music.MusicInfo): Promise<string | null> => {
  // 本地歌曲用的是 file:// 路径，网页端无法访问
  if (info.source == 'local') return null
  const key = `${info.source}_${info.id}`
  const cached = urlCache.get(key)
  if (cached && Date.now() - cached.at < URL_TTL) return cached.url
  // 同一首歌只发一次请求，避免每 4 秒广播都去打音源接口
  if (urlPending.has(key)) return cached?.url ?? null
  urlPending.add(key)
  try {
    const url = await Promise.race([
      getMusicUrl({ musicInfo: info, isRefresh: false }),
      new Promise<string>((resolve, reject) => {
        setTimeout(() => { reject(new Error('timeout')) }, URL_TIMEOUT)
      }),
    ])
    let value = typeof url == 'string' && /^https?:\/\//i.test(url) ? url : null
    if (value) value = await upgradeToHttps(value)
    urlCache.set(key, { url: value, at: Date.now() })
    return value
  } catch (err) {
    console.log('listen together get playable url error', err)
    urlCache.set(key, { url: null, at: Date.now() })
    return null
  } finally {
    urlPending.delete(key)
  }
}

export const buildMusicSnapshot = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem | null): LX.ListenTogether.MusicSnapshot | null => {
  const info = getMusicInfo(musicInfo)
  if (!info) return null
  return {
    id: info.id,
    source: info.source,
    name: info.name,
    singer: info.singer,
    album: info.meta.albumName ?? '',
    interval: info.interval,
    picUrl: info.meta.picUrl ?? null,
    musicInfo: info.source == 'local' ? null : info,
  }
}

/**
 * 获取可以安全广播的播放进度
 * 切歌后资源还没加载完成时 player 的进度可能还是上一首的，此时直接按 0 处理
 */
const getBroadcastPosition = async() => {
  if (!playerState.playMusicInfo.musicInfo) return 0
  if (global.lx.gettingUrlId) return 0
  if (playerState.progress.maxPlayTime <= 0) return 0
  const position = Number(await getPosition().catch(() => playerState.progress.nowPlayTime))
  if (!Number.isFinite(position) || position < 0) return 0
  return Math.min(position, playerState.progress.maxPlayTime)
}

/**
 * 广播房主的播放状态
 */
export const broadcastState = async() => {
  if (!canBroadcast()) return
  const info = getMusicInfo(playerState.playMusicInfo.musicInfo)
  const music = buildMusicSnapshot(info)
  const position = music ? await getBroadcastPosition() : 0
  // 网页端靠这个直链直接播放房主的音频（本地文件或取不到直链时为空）
  if (music && info) music.url = await getPlayableUrl(info)
  if (!canBroadcast()) return
  const playback: LX.ListenTogether.PlaybackState = {
    music,
    isPlaying: playerState.isPlay,
    position: position || 0,
    playRate: getPlayRate(),
    // 房间统一音质：成员按房主这个音质取播放地址
    quality: settingState.setting['player.playQuality'],
    sentAt: Date.now(),
  }
  lastBroadcast = { position: playback.position, at: playback.sentAt }
  ltActions.setPlayback(playback)
  ltActions.setSyncStatus('synced')
  const sent = client.sendState(playback)
  if (sent) {
    // 服务端广播会排除发送者，本端收不到「你已成为播放源」的回执，
    // 这里发送成功后直接认领播放源身份，否则下一首歌会被当成成员操作丢给房主
    ltActions.setPlaybackSource(ltState.selfId)
  }
}

const scheduleBroadcast = (delay = 100) => {
  if (!canBroadcast()) return
  if (broadcastDelayTimer) BackgroundTimer.clearTimeout(broadcastDelayTimer)
  broadcastDelayTimer = BackgroundTimer.setTimeout(() => {
    broadcastDelayTimer = null
    void broadcastState()
  }, delay)
}

/**
 * 成员端跟随房间音质
 * 房主换成 320k 后，成员下一次取地址（切歌 / 重新播放）就会用 320k
 */
const applyRoomQuality = (quality?: LX.Quality | null) => {
  setQualityOverride(quality ?? null)
}

/**
 * 成员端更新播放进度与播放状态
 */
const applyPlaybackPosition = async(remote: LX.ListenTogether.PlaybackState, receivedAt: number) => {
  if (!remote.music) return
  const elapsed = Math.max(0, (Date.now() - receivedAt) / 1000)
  const targetPosition = Math.max(0, remote.position + elapsed * (remote.playRate || 1))

  markRemoteApplied()
  applyingRemoteControl = true
  if (remoteControlTimer) BackgroundTimer.clearTimeout(remoteControlTimer)
  remoteControlTimer = BackgroundTimer.setTimeout(() => {
    remoteControlTimer = null
    applyingRemoteControl = false
  }, REMOTE_APPLY_QUIET)

  if (remote.isPlaying) {
    if (!playerState.isPlay) play()
  } else if (playerState.isPlay) {
    void pause()
  }

  // 使用播放器真实进度判断漂移，避免息屏时界面进度不更新导致反复 seek
  const currentPosition = await getPosition().catch(() => playerState.progress.nowPlayTime)
  if (Math.abs(targetPosition - currentPosition) > SYNC_THRESHOLD) {
    markRemoteApplied()
    global.app_event.setProgress(targetPosition)
  }
  ltActions.setSyncStatus('synced')
}

const stopPendingApply = () => {
  if (pendingTimer) {
    BackgroundTimer.clearInterval(pendingTimer)
    pendingTimer = null
  }
  pendingRemote = null
}

/**
 * 等歌曲加载完成后再同步进度，避免在资源未就绪时 seek 失效
 */
const scheduleApplyAfterLoad = (remote: LX.ListenTogether.PlaybackState, receivedAt: number, localId: string) => {
  stopPendingApply()
  pendingRemote = { state: remote, receivedAt, localId }
  const startAt = Date.now()
  pendingTimer = BackgroundTimer.setInterval(() => {
    const pending = pendingRemote
    if (!pending) {
      stopPendingApply()
      return
    }
    const musicInfo = getMusicInfo(playerState.playMusicInfo.musicInfo)
    if (!musicInfo || musicInfo.id != pending.localId) {
      if (Date.now() - startAt > LOAD_APPLY_TIMEOUT) stopPendingApply()
      return
    }
    // 时长未知时最多等 6 秒，避免部分歌曲拿不到时长导致一直不同步
    if (playerState.progress.maxPlayTime <= 0 && Date.now() - startAt < 6_000) return
    void applyPlaybackPosition(pending.state, pending.receivedAt)
    stopPendingApply()
  }, 300)
}

/**
 * 在本地音源中查找可播放的同名歌曲
 */
const findPlayableMusic = async(snapshot: LX.ListenTogether.MusicSnapshot): Promise<LX.Music.MusicInfoOnline | null> => {
  let list: LX.Music.MusicInfoOnline[] = []
  try {
    list = await findMusic({
      name: snapshot.name,
      singer: snapshot.singer,
      albumName: snapshot.album,
      interval: snapshot.interval,
      source: snapshot.source,
    }) as LX.Music.MusicInfoOnline[]
  } catch (err) {
    console.log('listen together find music error', err)
  }
  if (!list?.length) return null
  for (const musicInfo of list.slice(0, 3)) {
    try {
      await getMusicUrl({ musicInfo, isRefresh: false })
      return musicInfo
    } catch (err) {
      console.log('listen together get music url error', err)
    }
  }
  return null
}

const switchToRemoteMusic = async(remote: LX.ListenTogether.PlaybackState, receivedAt: number) => {
  const snapshot = remote.music
  if (!snapshot) return
  const key = `${snapshot.source}_${snapshot.id}`
  if (switchingKey == key) return
  switchingKey = key

  ltActions.setSyncStatus('syncing', snapshot.name)
  let musicInfo: LX.Music.MusicInfo | null = snapshot.musicInfo
  if (!musicInfo) musicInfo = await findPlayableMusic(snapshot)

  if (!musicInfo) {
    if (switchingKey == key) switchingKey = ''
    failedKey = key
    failedAt = Date.now()
    ltActions.setSyncStatus('failed')
    return
  }

  try {
    applyingRemote = true
    ltActions.setIsRemoteMusic(true)
    // 先切换到房间统一音质，再让播放器去取地址
    applyRoomQuality(remote.quality)
    await playMusicInfo(musicInfo)
  } catch (err) {
    console.log('listen together play remote music error', err)
    if (switchingKey == key) switchingKey = ''
    ltActions.setSyncStatus('failed')
    applyingRemote = false
    return
  }
  applyingRemote = false
  suppressControlUntil = Date.now() + SWITCH_QUIET
  if (switchingKey == key) switchingKey = ''
  scheduleApplyAfterLoad(remote, receivedAt, musicInfo.id)
}

/**
 * 成员端应用房主下发的播放状态
 */
export const applyRemoteState = (remote: LX.ListenTogether.PlaybackState | null, fromSelf: boolean) => {
  if (fromSelf) return
  const receivedAt = Date.now()
  // 播放源清空（如源成员退出）或换成别人时，回归跟随
  if (!remote) {
    suppressControlUntil = Date.now() + SWITCH_QUIET
    if (playerState.isPlay) void pause()
    ltActions.setPlayback(null)
    ltActions.setSyncStatus('idle')
    return
  }
  ltActions.setPlayback(remote)
  // 房间音质以房主为准
  applyRoomQuality(remote.quality)
  if (!remote.music) {
    // 房主停止了播放，成员跟着停下即可，不要把这次暂停再当成用户操作回传
    suppressControlUntil = Date.now() + SWITCH_QUIET
    if (playerState.isPlay) void pause()
    ltActions.setSyncStatus('idle')
    return
  }

  const key = `${remote.music.source}_${remote.music.id}`
  if (key == failedKey && Date.now() - failedAt < 30_000) return
  if (key != failedKey) failedKey = ''

  const current = getMusicInfo(playerState.playMusicInfo.musicInfo)
  if (!current || current.id != remote.music.id || current.source != remote.music.source) {
    void switchToRemoteMusic(remote, receivedAt)
    return
  }
  void applyPlaybackPosition(remote, receivedAt)
}

const handleMusicChanged = () => {
  if (canBroadcast()) {
    scheduleBroadcast(200)
    return
  }
  // 成员端自动切歌（上一首播完）时，播放器自己会改播放状态，不算用户操作
  if (canControl()) suppressControlUntil = Date.now() + SWITCH_QUIET
}

const handlePlayStateChanged = () => {
  if (canBroadcast()) {
    scheduleBroadcast(80)
    return
  }
  if (!canControl()) return
  if (applyingRemoteControl || Date.now() < suppressControlUntil || Date.now() - remoteApplyAt < REMOTE_APPLY_QUIET) return
  sendControl(playerState.isPlay ? 'play' : 'pause')
}

/**
 * 成员手动拖动进度 / 点歌词跳转
 */
const handleSeek = (time: number) => {
  if (!canControl() || !Number.isFinite(time)) return
  if (Date.now() < suppressControlUntil || Date.now() - remoteApplyAt < REMOTE_APPLY_QUIET) return
  sendControl('seek', Math.max(0, time))
}

/**
 * 播放源（房主或播放源成员）执行成员发来的播放控制
 */
export const applyRemoteControl = (action: 'play' | 'pause' | 'seek', position?: number) => {
  if (!ltState.isHost && ltState.playbackSourceId != ltState.selfId) return
  applyingRemote = true
  if (action == 'seek' && typeof position == 'number' && Number.isFinite(position)) {
    global.app_event.setProgress(Math.max(0, position))
  } else if (action == 'play') {
    if (!playerState.isPlay) play()
  } else if (action == 'pause') {
    if (playerState.isPlay) void pause()
  }
  applyingRemote = false
  scheduleBroadcast(80)
}

const handleProgressChanged = (progress: typeof playerState.progress) => {
  if (!canBroadcast() || !playerState.isPlay) return
  if (lastBroadcast.at && progress.nowPlayTime > 0) {
    const elapsed = (Date.now() - lastBroadcast.at) / 1000
    const expected = lastBroadcast.position + elapsed * getPlayRate()
    // 进度跳变说明房主手动调整了进度，立即同步给成员
    if (Math.abs(progress.nowPlayTime - expected) > SEEK_THRESHOLD) scheduleBroadcast(0)
  }
}

const handlePlayerError = () => {
  if (isPlaybackSource() || !ltState.playback?.music) return
  const snapshot = ltState.playback.music
  const key = `${snapshot.source}_${snapshot.id}`
  if (fallbackTried.has(key)) return
  const current = getMusicInfo(playerState.playMusicInfo.musicInfo)
  if (!current || current.id != snapshot.id) return
  fallbackTried.add(key)

  void findPlayableMusic({ ...snapshot, source: current.source }).then(musicInfo => {
    if (!musicInfo || musicInfo.id == current.id) return
    void playMusicInfo(musicInfo).catch((err: any) => {
      console.log('listen together fallback play error', err)
    })
  })
}

/**
 * 绑定播放器事件（应用启动时调用一次）
 */
export const bindPlayerSync = () => {
  if (isBound) return
  isBound = true
  global.state_event.on('playMusicInfoChanged', handleMusicChanged)
  global.state_event.on('playStateChanged', handlePlayStateChanged)
  global.state_event.on('playProgressChanged', handleProgressChanged)
  // 拖动进度条 / 点歌词跳转最终都会走 setProgress
  global.app_event.on('setProgress', handleSeek)
  global.app_event.on('error', handlePlayerError)
}

/**
 * 有播放权（房主或播放源成员）时，定期广播播放状态
 */
export const startHostSync = () => {
  stopHostSync()
  void broadcastState()
  broadcastTimer = BackgroundTimer.setInterval(() => {
    void broadcastState()
  }, BROADCAST_INTERVAL)
}

export const startSyncIfSource = () => {
  if (canBroadcast()) startHostSync()
  else stopHostSync()
}

export const stopHostSync = () => {
  if (broadcastTimer) {
    BackgroundTimer.clearInterval(broadcastTimer)
    broadcastTimer = null
  }
  if (broadcastDelayTimer) {
    BackgroundTimer.clearTimeout(broadcastDelayTimer)
    broadcastDelayTimer = null
  }
  lastBroadcast = { position: 0, at: 0 }
}

/**
 * 退出房间时清理同步状态
 */
export const resetPlayerSync = () => {
  stopHostSync()
  stopPendingApply()
  switchingKey = ''
  failedKey = ''
  failedAt = 0
  fallbackTried.clear()
  urlCache.clear()
  urlPending.clear()
  lastBroadcast = { position: 0, at: 0 }
  remoteApplyAt = 0
  suppressControlUntil = 0
  lastControlAt = 0
  applyingRemoteControl = false
  if (remoteControlTimer) {
    BackgroundTimer.clearTimeout(remoteControlTimer)
    remoteControlTimer = null
  }
  // 退出房间后恢复用户自己的音质设置
  applyRoomQuality(null)
}
