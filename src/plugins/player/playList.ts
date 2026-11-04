import TrackPlayer, { State } from 'react-native-track-player'
import BackgroundTimer from 'react-native-background-timer'
import { defaultUrl } from '@/config'
// import { action as playerAction } from '@/store/modules/player'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { getWebDAVAuthHeader, getWebDAVServer, isSameOrigin } from '@/core/webdavMusic'
import { safeNum } from '@/utils/safeNativeArgs'
import { dlog } from '@/utils/debugLog'


const list: LX.Player.Track[] = []

const defaultUserAgent = 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36'
const httpRxp = /^(https?:\/\/.+|\/.+)/

export const state = {
  isPlaying: false,
  prevDuration: -1,
}

const formatMusicInfo = (musicInfo: LX.Player.PlayMusic) => {
  return 'progress' in musicInfo ? {
    id: musicInfo.id,
    pic: musicInfo.metadata.musicInfo.meta.picUrl,
    name: musicInfo.metadata.musicInfo.name,
    singer: musicInfo.metadata.musicInfo.singer,
    album: musicInfo.metadata.musicInfo.meta.albumName,
  } : {
    id: musicInfo.id,
    pic: musicInfo.meta.picUrl,
    name: musicInfo.name,
    singer: musicInfo.singer,
    album: musicInfo.meta.albumName,
  }
}

const getCurrentFullLyric = (targetId: string | null) => {
  return (settingState.setting['player.isShowBluetoothFullLyric'] && targetId &&
      playerState.musicInfo.id == targetId && playerState.musicInfo.lrc)
    ? playerState.musicInfo.lrc
    : undefined
}

const buildTracks = (musicInfo: LX.Player.PlayMusic, url?: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track[] => {
  const mInfo = formatMusicInfo(musicInfo)
  const track = [] as LX.Player.Track[]
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  const album = mInfo.album || undefined
  const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
  const lyric = getCurrentFullLyric(mInfo.id)
  // WebDAV 云盘歌曲需要带 Basic Auth，播放器 Track 支持 headers（1.23.0）
  const isWebdav = 'progress' in musicInfo
    ? !!(musicInfo.metadata.musicInfo as unknown as LX.Music.MusicInfoLocal).meta?.webdav
    : !!(musicInfo as LX.Music.MusicInfoLocal).meta?.webdav
  // 解析过跳转的地址可能指向对象存储（预签名），那种地址再带 Authorization
  // 会被判定成「两套认证」直接 400，只给同源地址加认证头（1.22.26）
  const needAuth = isWebdav && !!url && isSameOrigin(String(url), getWebDAVServer().url)
  const authHeader = needAuth ? getWebDAVAuthHeader() : null
  const headers = authHeader ? { Authorization: authHeader } : undefined
  if (url) {
    track.push({
      id: `${mInfo.id}__//${Math.random()}__//${url}`,
      url,
      headers,
      title: mInfo.name || 'Unknow',
      artist: mInfo.singer || 'Unknow',
      album,
      artwork,
      userAgent: defaultUserAgent,
      musicId: mInfo.id,
      lyric,
      // original: { ...musicInfo },
      duration,
    })
  }
  track.push({
    id: `${mInfo.id}__//${Math.random()}__//default`,
    url: defaultUrl,
    title: mInfo.name || 'Unknow',
    artist: mInfo.singer || 'Unknow',
    album,
    artwork,
    musicId: mInfo.id,
    lyric,
    // original: { ...musicInfo },
    duration: 0,
  })
  return track
  // console.log('buildTrack', musicInfo.name, url)
}
// const buildTrack = (musicInfo: LX.Player.PlayMusic, url: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track => {
//   const mInfo = formatMusicInfo(musicInfo)
//   const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
//   const album = mInfo.album || undefined
//   const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
//   return url
//     ? {
//         id: `${mInfo.id}__//${Math.random()}__//${url}`,
//         url,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         userAgent: defaultUserAgent,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration,
//       }
//     : {
//         id: `${mInfo.id}__//${Math.random()}__//default`,
//         url: defaultUrl,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration: 0,
//       }
// }

export const isTempTrack = (trackId: string) => /\/\/default$/.test(trackId)


export const getCurrentTrackId = async() => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  return list[currentTrackIndex]?.id
}
export const getCurrentTrack = async() => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  return list[currentTrackIndex]
}

export const updateMetaData = async(musicInfo: LX.Player.MusicInfo, isPlay: boolean, force = false) => {
  if (!force && isPlay == state.isPlaying) {
    const duration = await TrackPlayer.getDuration()
    if (state.prevDuration != duration) {
      state.prevDuration = duration
      const trackInfo = await getCurrentTrack()
      if (trackInfo && musicInfo) {
        delayUpdateMusicInfo(musicInfo)
      }
    }
  } else {
    const [duration, trackInfo] = await Promise.all([TrackPlayer.getDuration(), getCurrentTrack()])
    state.prevDuration = duration
    if (trackInfo && musicInfo) {
      delayUpdateMusicInfo(musicInfo)
    }
  }
}

export const initTrackInfo = async(musicInfo: LX.Player.PlayMusic, mInfo: LX.Player.MusicInfo) => {
  const tracks = buildTracks(musicInfo)
  await TrackPlayer.add(tracks).then(() => list.push(...tracks))
  const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
  await TrackPlayer.skip(queue.findIndex(t => t.id == tracks[0].id))
  delayUpdateMusicInfo(mInfo)
}


const handlePlayMusic = async(musicInfo: LX.Player.PlayMusic, url: string, time: number) => {
// console.log(tracks, time)
  const trackName = (musicInfo as any).name ?? (musicInfo as any).metadata?.musicInfo?.name
  const startedAt = Date.now()
  dlog('play', 'handlePlayMusic 开始', trackName, 'time=' + time, 'url=' + String(url).slice(0, 80))
  const tracks = buildTracks(musicInfo, url)
  const track = tracks[0]

  // 每一步单独记时，卡在哪一步一眼能看出来
  const step = async<T>(label: string, task: Promise<T>): Promise<T> => {
    const start = Date.now()
    try {
      const result = await task
      dlog('play', `  ${label} ok (${Date.now() - start}ms)`)
      return result
    } catch (err: any) {
      dlog('play', `  ${label} 失败 (${Date.now() - start}ms)`, err?.message ?? err)
      throw err
    }
  }

  // await updateMusicInfo(track)
  const currentTrackIndex = await step('getCurrentTrack', TrackPlayer.getCurrentTrack())
  dlog('play', '  currentTrackIndex=' + String(currentTrackIndex))
  await step('add', TrackPlayer.add(tracks).then(() => list.push(...tracks)))
  const queue = await step('getQueue', TrackPlayer.getQueue()) as LX.Player.Track[]
  dlog('play', '  queue.length=' + queue.length)
  const targetIndex = queue.findIndex(t => t.id == track.id)
  dlog('play', '  targetIndex=' + targetIndex)
  await step('skip', TrackPlayer.skip(targetIndex))

  if (currentTrackIndex == null) {
    if (!isTempTrack(track.id as string)) {
      if (time) await step('seekTo(restore)', TrackPlayer.seekTo(safeNum(time, 0, 'TrackPlayer.seekTo(restore)')))
      if (global.lx.restorePlayInfo) {
        await step('pause(restore)', TrackPlayer.pause())
        // let startupAutoPlay = settingState.setting['player.startupAutoPlay']
        global.lx.restorePlayInfo = null

      // TODO startupAutoPlay
      // if (startupAutoPlay) store.dispatch(playerAction.playMusic())
      } else {
        await step('play', TrackPlayer.play())
      }
    } else {
      dlog('play', '  当前是占位曲目(临时id)，跳过自动播放')
    }
  } else {
    await step('pause', TrackPlayer.pause())
    if (!isTempTrack(track.id as string)) {
      await step('seekTo', TrackPlayer.seekTo(safeNum(time, 0, 'TrackPlayer.seekTo')))
      await step('play', TrackPlayer.play())
    } else {
      dlog('play', '  当前是占位曲目(临时id)，跳过自动播放')
    }
  }

  if (queue.length > 2) {
    void TrackPlayer.remove(Array(queue.length - 2).fill(null).map((_, i) => i)).then(() => list.splice(0, list.length - 2))
  }
  dlog('play', 'handlePlayMusic 结束', trackName, '总耗时=' + (Date.now() - startedAt) + 'ms')
}
/**
 * 单次播放流程的最长等待时间。
 * 原生播放调用如果因为服务未就绪一直不回调，promise 会永远挂着，
 * 而所有播放请求都排在同一条 playPromise 链上 —— 那就会出现「必须重启才能播」。
 * 这里给它一个上限，超时就放弃这次、放行后面的请求。
 */
const PLAY_TIMEOUT = 15000

const withPlayTimeout = <T>(task: Promise<T>, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      dlog('play', `${label} 超时(${PLAY_TIMEOUT}ms)，放行后续播放请求`)
      reject(new Error(`${label} timeout`))
    }, PLAY_TIMEOUT)
    task.then((value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }, (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}

let playPromise = Promise.resolve()
let actionId = Math.random()
export const playMusic = (musicInfo: LX.Player.PlayMusic, url: string, time: number) => {
  const id = actionId = Math.random()
  dlog('play', 'playMusic 入队', (musicInfo as any).name, 'id=' + id.toFixed(3))
  void playPromise.finally(() => {
    if (id != actionId) {
      dlog('play', 'playMusic 被更新的请求覆盖，丢弃', 'id=' + id.toFixed(3), 'latest=' + actionId.toFixed(3))
      return
    }
    dlog('play', 'playMusic 开始执行', 'id=' + id.toFixed(3))
    playPromise = withPlayTimeout(handlePlayMusic(musicInfo, url, time), 'handlePlayMusic').catch((err: any) => {
      // 这里必须吞掉并记录：否则 playPromise 会变成 rejected，
      // 后续所有播放请求都会挂在一条已失败的链上，表现出来就是「必须重启才能播」
      dlog('play', 'handlePlayMusic 异常结束', err?.message ?? err)
    })
  })
}

// let musicId = null
// let duration = 0
let prevArtwork: string | undefined
const updateMetaInfo = async(mInfo: LX.Player.MusicInfo) => {
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  // const mInfo = formatMusicInfo(musicInfo)
  // console.log('+++++updateMusicPic+++++', track.artwork, track.duration)

  // if (track.musicId == musicId) {
  //   if (global.playInfo.musicInfo.img != null) artwork = global.playInfo.musicInfo.img
  //   if (track.duration != null) duration = global.playInfo.duration
  // } else {
  //   musicId = track.musicId
  //   artwork = global.playInfo.musicInfo.img
  //   duration = global.playInfo.duration || 0
  // }
  // console.log('+++++updateMetaInfo+++++', mInfo.name)
  state.isPlaying = await TrackPlayer.getState() == State.Playing
  let artwork = isShowNotificationImage ? mInfo.pic ?? prevArtwork : undefined
  if (mInfo.pic) prevArtwork = mInfo.pic
  let title: string
  let artist: string
  if (playerState.lastLyric == null) {
    title = mInfo.name ?? 'Unknow'
    artist = mInfo.singer ?? 'Unknow'
  } else {
    title = playerState.lastLyric
    artist = `${mInfo.name}${mInfo.singer ? ` - ${mInfo.singer}` : ''}`
  }
  await TrackPlayer.updateNowPlayingMetadata({
    title,
    artist,
    album: mInfo.album ?? undefined,
    artwork,
    duration: state.prevDuration || 0,
    lyric: getCurrentFullLyric(mInfo.id),
  }, state.isPlaying)
}


// 解决快速切歌导致的通知栏歌曲信息与当前播放歌曲对不上的问题
//
// 原实现同样用 BackgroundTimer 的 500ms 定时器来复位 isDelayRun，一旦该定时器不触发，
// 后续所有元数据更新都会被排进一个不会执行的定时器里 —— 表现是通知栏/媒体会话的
// 标题、封面停在上一首，锁屏和背屏也跟着不刷新。这里改成纯 JS 定时器防抖。
const debounceUpdateMetaInfoTools = {
  updateMetaPromise: Promise.resolve() as Promise<any>,
  musicInfo: null as LX.Player.MusicInfo | null,
  timer: null as ReturnType<typeof setTimeout> | null,
  debounce(musicInfo: LX.Player.MusicInfo) {
    this.musicInfo = musicInfo
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const target = this.musicInfo
      if (!target) return
      this.updateMetaPromise = this.updateMetaPromise.then(() => {
        if (this.musicInfo?.id !== target.id) return
        return updateMetaInfo(target)
      }).catch((err: any) => {
        dlog('play', '更新通知栏信息失败', err?.message ?? err)
      })
    }, 300)
  },
  init() {
    return (musicInfo: LX.Player.MusicInfo) => {
      this.debounce(musicInfo)
    }
  },
}

export const delayUpdateMusicInfo = debounceUpdateMetaInfoTools.init()

// export const delayUpdateMusicInfo = ((fn, delay = 800) => {
//   let delayTimer = null
//   let isDelayRun = false
//   let timer = null
//   let _track = null
//   return track => {
//     _track = track
//     if (timer) {
//       BackgroundTimer.clearTimeout(timer)
//       timer = null
//     }
//     if (isDelayRun) {
//       if (delayTimer) {
//         BackgroundTimer.clearTimeout(delayTimer)
//         delayTimer = null
//       }
//       timer = BackgroundTimer.setTimeout(() => {
//         timer = null
//         let track = _track
//         _track = null
//         isDelayRun = false
//         fn(track)
//       }, delay)
//     } else {
//       isDelayRun = true
//       fn(track)
//       delayTimer = BackgroundTimer.setTimeout(() => {
//         delayTimer = null
//         isDelayRun = false
//       }, 500)
//     }
//   }
// })(track => {
//   console.log('+++++delayUpdateMusicPic+++++', track.artwork)
//   updateMetaInfo(track)
// })
