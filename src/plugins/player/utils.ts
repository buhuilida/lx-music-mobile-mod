import TrackPlayer, { Capability, Event, RepeatMode, State } from 'react-native-track-player'
import BackgroundTimer from 'react-native-background-timer'
import { playMusic as handlePlayMusic } from './playList'
import { existsFile, moveFile, privateStorageDirectoryPath, temporaryDirectoryPath } from '@/utils/fs'
import { toast } from '@/utils/tools'
import { safeNum } from '@/utils/safeNativeArgs'
import { dlog } from '@/utils/debugLog'
import playerState from '@/store/player/state'
// import { PlayerMusicInfo } from '@/store/modules/player/playInfo'


export { useBufferProgress } from './hook'

const emptyIdRxp = /\/\/default$/
const tempIdRxp = /\/\/default$|\/\/default\/\/restorePlay$/
export const isEmpty = (trackId = global.lx.playerTrackId) => {
  // console.log(trackId)
  return !trackId || emptyIdRxp.test(trackId)
}
export const isTempId = (trackId = global.lx.playerTrackId) => !trackId || tempIdRxp.test(trackId)

// export const replacePlayTrack = async(newTrack, oldTrack) => {
//   console.log('replaceTrack')
//   await TrackPlayer.add(newTrack)
//   await TrackPlayer.skip(newTrack.id)
//   await TrackPlayer.remove(oldTrack.id)
// }

// let timeout
// let isFirstPlay = true
// const updateInfo = async track => {
//   if (isFirstPlay) {
//     // timeout = setTimeout(() => {
//     await delayUpdateMusicInfo(track)
//     isFirstPlay = false
//     // }, 500)
//   }
// }


// 解决快速切歌导致的通知栏歌曲信息与当前播放歌曲对不上的问题
// const debouncePlayMusicTools = {
//   prevPlayMusicPromise: Promise.resolve(),
//   trackInfo: {},
//   isDelayUpdate: false,
//   isDebounced: false,
//   delay: 1000,
//   delayTimer: null,
//   debounce(fn, delay = 100) {
//     let timer = null
//     let _tracks = null
//     let _time = null
//     return (tracks, time) => {
//       if (!this.isDebounced && _tracks != null) this.isDebounced = true
//       _tracks = tracks
//       _time = time
//       if (timer) {
//         BackgroundTimer.clearTimeout(timer)
//         timer = null
//       }
//       if (this.isDelayUpdate) {
//         if (this.updateDelayTimer) {
//           BackgroundTimer.clearTimeout(this.updateDelayTimer)
//           this.updateDelayTimer = null
//         }
//         timer = BackgroundTimer.setTimeout(() => {
//           timer = null
//           let tracks = _tracks
//           let time = _time
//           _tracks = null
//           _time = null
//           this.isDelayUpdate = false
//           fn(tracks, time)
//         }, delay)
//       } else {
//         this.isDelayUpdate = true
//         fn(tracks, time)
//         this.updateDelayTimer = BackgroundTimer.setTimeout(() => {
//           this.updateDelayTimer = null
//           this.isDelayUpdate = false
//         }, this.delay)
//       }
//     }
//   },
//   delayUpdateMusicInfo() {
//     if (this.delayTimer) BackgroundTimer.clearTimeout(this.delayTimer)
//     this.delayTimer = BackgroundTimer.setTimeout(() => {
//       this.delayTimer = null
//       if (this.trackInfo.tracks && this.trackInfo.tracks.length) delayUpdateMusicInfo(this.trackInfo.tracks[0])
//     }, this.delay)
//   },
//   init() {
//     return this.debounce((tracks, time) => {
//       tracks = [...tracks]
//       this.trackInfo.tracks = tracks
//       this.trackInfo.time = time
//       return this.prevPlayMusicPromise.then(() => {
//         // console.log('run')
//         if (this.trackInfo.tracks === tracks) {
//           this.prevPlayMusicPromise = handlePlayMusic(tracks, time).then(() => {
//             if (this.isDebounced) {
//               this.delayUpdateMusicInfo()
//               this.isDebounced = false
//             }
//           })
//         }
//       })
//     }, 200)
//   },
// }

/**
 * 直接交给 playList 的串行队列播放。
 *
 * 这里原来有一层 800ms 延迟闸门：首次调用立刻播，500ms 内的重复调用延后 800ms。
 * 闸门的开合依赖 BackgroundTimer 的定时器，而实测该定时器会晚几秒、甚至完全不触发，
 * 结果是 isDelayRun 永远停在 true，之后每次播放都只会「排进 800ms 定时器」然后石沉大海
 * —— 表现就是换音源后点歌一直卡在「歌曲链接获取中」，必须重启才恢复。
 * playList.playMusic 内部本来就有 playPromise 串行 + actionId 去重，这层闸门是多余的。
 */
export const setResource = (musicInfo: LX.Player.PlayMusic, url: string, duration?: number) => {
  dlog('play', 'setResource 交给播放队列', (musicInfo as any).name, 'duration=' + (duration ?? 0), String(url).slice(0, 70))
  handlePlayMusic(musicInfo, url, duration ?? 0)
}


export const setPlay = async() => TrackPlayer.play()
export const getPosition = async() => TrackPlayer.getPosition()
export const getDuration = async() => TrackPlayer.getDuration()
export const setStop = async() => {
  await TrackPlayer.stop()
  if (!isEmpty()) await TrackPlayer.skipToNext()
}
export const setLoop = async(loop: boolean) => TrackPlayer.setRepeatMode(loop ? RepeatMode.Off : RepeatMode.Track)

export const setPause = async() => TrackPlayer.pause()
// export const skipToNext = () => TrackPlayer.skipToNext()
export const setCurrentTime = async(time: number) => TrackPlayer.seekTo(safeNum(time, 0, 'TrackPlayer.seekTo'))
export const setVolume = async(num: number) => TrackPlayer.setVolume(safeNum(num, 0, 'TrackPlayer.setVolume'))
export const setPlaybackRate = async(num: number) => TrackPlayer.setRate(safeNum(num, 1, 'TrackPlayer.setRate'))
export interface NowPlayingTitles {
  title?: string
  artist?: string
  album?: string
  lyric?: string
  /** ColorOS / OPlus 原生歌词载荷（JSON 字符串） */
  lyricInfo?: string
  /** 歌曲时长（秒），不传则取当前播放歌曲的时长 */
  duration?: number
}
export const updateNowPlayingTitles = async(titles: NowPlayingTitles) => {
  // 原生签名是 updateNowPlayingTitles(float duration, String title, String artist, String album, Promise)。
  // 早期实现直接把这个对象整体传下去，第一个参数位（float）会收到 ReadableNativeMap，
  // 桥接层抛 ClassCastException 且 JS 侧无法捕获 → 直接闪退。
  // 歌词（lyric）没有独立参数位，按原语义落到 title（通知栏/媒体会话显示的那一行）。
  // 在线歌曲的时长在 musicInfo.interval，本地歌曲在 meta.interval，类型上不统一，这里宽松取
  const currentInfo: any = playerState.musicInfo
  const duration = safeNum(
    titles.duration ?? currentInfo?.interval ?? currentInfo?.meta?.interval,
    0,
    'TrackPlayer.updateNowPlayingTitles.duration',
  )
  return TrackPlayer.updateNowPlayingTitles(
    duration,
    titles.title ?? titles.lyric ?? '',
    titles.artist ?? '',
    titles.album ?? '',
  )
}

export const resetPlay = async() => Promise.all([setPause(), setCurrentTime(0)])

export const isCached = async(url: string) => TrackPlayer.isCached(url)
export const getCacheSize = async() => TrackPlayer.getCacheSize()
export const clearCache = async() => TrackPlayer.clearCache()
export const migratePlayerCache = async() => {
  const newCachePath = privateStorageDirectoryPath + '/TrackPlayer'
  if (await existsFile(newCachePath)) return
  const oldCachePath = temporaryDirectoryPath + '/TrackPlayer'
  if (!await existsFile(oldCachePath)) return
  let timeout: number | null = BackgroundTimer.setTimeout(() => {
    timeout = null
    toast(global.i18n.t('player_cache_migrating'), 'long')
  }, 2_000)
  await moveFile(oldCachePath, newCachePath).finally(() => {
    if (timeout) BackgroundTimer.clearTimeout(timeout)
  })
}

export const destroy = async() => {
  if (global.lx.playerStatus.isIniting || !global.lx.playerStatus.isInitialized) return
  await TrackPlayer.destroy()
  global.lx.playerStatus.isInitialized = false
}

type PlayStatus = 'None' | 'Ready' | 'Playing' | 'Paused' | 'Stopped' | 'Buffering' | 'Connecting'

export const onStateChange = async(listener: (state: PlayStatus) => void) => {
  const sub = TrackPlayer.addEventListener(Event.PlaybackState, state => {
    let _state: PlayStatus
    switch (state) {
      case State.Ready:
        _state = 'Ready'
        break
      case State.Playing:
        _state = 'Playing'
        break
      case State.Paused:
        _state = 'Paused'
        break
      case State.Stopped:
        _state = 'Stopped'
        break
      case State.Buffering:
        _state = 'Buffering'
        break
      case State.Connecting:
        _state = 'Connecting'
        break
      case State.None:
      default:
        _state = 'None'
        break
    }
    listener(_state)
  })

  return () => {
    sub.remove()
  }
}

/**
 * Subscription player state chuange event
 * @param options state change event
 * @returns remove event function
 */
// export const playState = callback => TrackPlayer.addEventListener('playback-state', callback)

export const updateOptions = async(options = {
  // Whether the player should stop running when the app is closed on Android
  // stopWithApp: true,

  // An array of media controls capabilities
  // Can contain CAPABILITY_PLAY, CAPABILITY_PAUSE, CAPABILITY_STOP, CAPABILITY_SEEK_TO,
  // CAPABILITY_SKIP_TO_NEXT, CAPABILITY_SKIP_TO_PREVIOUS, CAPABILITY_SET_RATING
  capabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.Stop,
    Capability.SeekTo,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
  ],

  notificationCapabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.Stop,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
  ],

  // // An array of capabilities that will show up when the notification is in the compact form on Android
  compactCapabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.Stop,
    Capability.SkipToNext,
  ],

  // Icons for the notification on Android (if you don't like the default ones)
  // playIcon: require('./play-icon.png'),
  // pauseIcon: require('./pause-icon.png'),
  // stopIcon: require('./stop-icon.png'),
  // previousIcon: require('./previous-icon.png'),
  // nextIcon: require('./next-icon.png'),
  // icon: notificationIcon, // The notification icon
}) => {
  return TrackPlayer.updateOptions(options)
}

// export const setMaxCache = async size => {
//   // const currentTrack = await TrackPlayer.getCurrentTrack()
//   // if (!currentTrack) return
//   // console.log(currentTrack)
//   // const currentTime = await TrackPlayer.getPosition()
//   // const state = await TrackPlayer.getState()
//   // await stop()
//   // await TrackPlayer.destroy()
//   // await TrackPlayer.setupPlayer({ maxCacheSize: size * 1024, maxBuffer: 1000, waitForBuffer: true })
//   // await updateOptions()
//   // await TrackPlayer.seekTo(currentTime)
//   // switch (state) {
//   //   case TrackPlayer.STATE_PLAYING:
//   //   case TrackPlayer.STATE_BUFFERING:
//   //     await TrackPlayer.play()
//   //     break
//   //   default:
//   //     break
//   // }
// }

// export {
//   useProgress,
// }

export { updateMetaData, initTrackInfo } from './playList'
