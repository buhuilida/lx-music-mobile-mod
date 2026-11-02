import {
  play as lrcPlay,
  setLyric as lrcSetLyric,
  pause as lrcPause,
  setPlaybackRate as lrcSetPlaybackRate,
  toggleTranslation as lrcToggleTranslation,
  toggleRoma as lrcToggleRoma,
  init as lrcInit,
} from '@/plugins/lyric'
import {
  playDesktopLyric,
  setDesktopLyric,
  pauseDesktopLyric,
  setDesktopLyricPlaybackRate,
  toggleDesktopLyricTranslation,
  toggleDesktopLyricRoma,
} from '@/core/desktopLyric'
import { getPosition } from '@/plugins/player'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { publishSystemLyric } from '@/core/player/systemLyric'
import { hasWordTags, stripWordTags } from '@/utils/wordLyric'

/**
 * init lyric
 */
export const init = async() => {
  return lrcInit()
}

/**
 * set lyric
 * @param lyric lyric str
 * @param translation lyric translation
 */
const handleSetLyric = async(lyric: string, translation = '', romalrc = '') => {
  // 逐字歌词：优先用当前歌曲已加载的 lxlyric；歌词本身是逐字格式时直接解析它（1.17.0 修复 <0,200> 裸显）
  const lxlyric = playerState.musicInfo.lxlrc ?? undefined
  const inlineWord = !lxlyric && hasWordTags(lyric)
  const cleanLrc = hasWordTags(lyric) ? stripWordTags(lyric) : lyric
  const wordSource = lxlyric ?? (inlineWord ? lyric : undefined)
  lrcSetLyric(cleanLrc, translation, romalrc, wordSource)
  await setDesktopLyric(cleanLrc, translation, romalrc, wordSource)
  // 按 ColorOS / OPlus 的 lyricInfo 契约，把整首歌词交给系统渲染
  publishSystemLyric(cleanLrc, translation, wordSource)
  if (settingState.setting['player.isShowBluetoothFullLyric']) {
    void updateNowPlayingTitles({
      lyric: cleanLrc,
    })
  }
  // 一起听：房主把歌词推给房间（由 listenTogether 注册，避免循环依赖）
  lyricPublisher?.({ lrc: cleanLrc, tlrc: translation, rlrc: romalrc })
}

interface LyricPayload {
  lrc: string
  tlrc: string
  rlrc: string
}

let lyricPublisher: ((payload: LyricPayload) => void) | null = null

/**
 * 注册「歌词更新」的对外发布器（一起听房主用）
 */
export const setLyricPublisher = (publisher: ((payload: LyricPayload) => void) | null) => {
  lyricPublisher = publisher
}

/**
 * 一起听：成员锁定房主推送的歌词
 * 之后不管是本地歌词加载完成还是重新 setLyric，都优先使用这份，保证两端歌词与时间轴一致
 */
let lockedLyric: { musicId: string } & LyricPayload | null = null

export const setLockedLyric = (musicId: string, lrc: string, tlrc: string, rlrc: string) => {
  lockedLyric = { musicId, lrc, tlrc, rlrc }
  void handleSetLyric(lrc, tlrc, rlrc)
}

export const clearLockedLyric = () => {
  lockedLyric = null
}

/**
 * play lyric
 * @param time play time
 */
export const handlePlay = (time: number) => {
  lrcPlay(time)
  void playDesktopLyric(time)
}

/**
 * pause lyric
 */
export const pause = () => {
  lrcPause()
  void pauseDesktopLyric()
}

/**
 * stop lyric
 */
export const stop = () => {
  void handleSetLyric('')
}

/**
 * set playback rate
 * @param playbackRate playback rate
 */
export const setPlaybackRate = async(playbackRate: number) => {
  lrcSetPlaybackRate(playbackRate)
  await setDesktopLyricPlaybackRate(playbackRate)
  if (playerState.isPlay) {
    setTimeout(() => {
      void getPosition().then((position) => {
        handlePlay(position * 1000)
      })
    })
  }
}

/**
 * toggle show translation
 * @param isShowTranslation is show translation
 */
export const toggleTranslation = async(isShowTranslation: boolean) => {
  lrcToggleTranslation(isShowTranslation)
  await toggleDesktopLyricTranslation(isShowTranslation)
  if (playerState.isPlay) play()
}

/**
 * toggle show roma lyric
 * @param isShowLyricRoma is show roma lyric
 */
export const toggleRoma = async(isShowLyricRoma: boolean) => {
  lrcToggleRoma(isShowLyricRoma)
  await toggleDesktopLyricRoma(isShowLyricRoma)
  if (playerState.isPlay) play()
}

export const play = () => {
  void getPosition().then((position) => {
    handlePlay(position * 1000)
  })
}


export const setLyric = async() => {
  const musicInfo = playerState.musicInfo
  if (!musicInfo.id) return
  // 一起听成员：房主已经把这首歌的歌词推过来了，直接用
  if (lockedLyric && lockedLyric.musicId == musicInfo.id) {
    await handleSetLyric(lockedLyric.lrc, lockedLyric.tlrc, lockedLyric.rlrc)
  } else if (musicInfo.lrc) {
    let tlrc = ''
    let rlrc = ''
    if (musicInfo.tlrc) tlrc = musicInfo.tlrc
    if (musicInfo.rlrc) rlrc = musicInfo.rlrc
    await handleSetLyric(musicInfo.lrc, tlrc, rlrc)
  }

  if (playerState.isPlay) play()
}
