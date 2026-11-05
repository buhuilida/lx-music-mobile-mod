import {
  setLyric as lrcSetLyric,
  pause as lrcPause,
  setPlaybackRate as lrcSetPlaybackRate,
  toggleTranslation as lrcToggleTranslation,
  toggleRoma as lrcToggleRoma,
  init as lrcInit,
  resync as lrcResync,
} from '@/plugins/lyric'
import {
  playDesktopLyric,
  setDesktopLyric,
  pauseDesktopLyric,
  setDesktopLyricPlaybackRate,
} from '@/core/desktopLyric'
import { getPosition } from '@/plugins/player'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { publishSystemLyric } from '@/core/player/systemLyric'
import { hasWordTags, stripWordTags } from '@/utils/wordLyric'
import { stripLyricPlaceholderLines } from '@/utils/lrcTools'

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
  const cleanLrc = stripLyricPlaceholderLines(hasWordTags(lyric) ? stripWordTags(lyric) : lyric)
  // `//` 是音源给的「本行无翻译 / 无音译」占位符，不清掉就会在每行歌词下面多出一行斜杠
  const cleanTranslation = stripLyricPlaceholderLines(translation)
  const cleanRoma = stripLyricPlaceholderLines(romalrc)
  const wordSource = lxlyric ?? (inlineWord ? lyric : undefined)
  lrcSetLyric(cleanLrc, cleanTranslation, cleanRoma, wordSource)
  await setDesktopLyric(cleanLrc, cleanTranslation, cleanRoma, wordSource)
  // 按 ColorOS / OPlus 的 lyricInfo 契约，把整首歌词交给系统渲染
  publishSystemLyric(cleanLrc, cleanTranslation, wordSource)
  if (settingState.setting['player.isShowBluetoothFullLyric']) {
    void updateNowPlayingTitles({
      lyric: cleanLrc,
    })
  }
  // 一起听：房主把歌词推给房间（由 listenTogether 注册，避免循环依赖）
  lyricPublisher?.({ lrc: cleanLrc, tlrc: cleanTranslation, rlrc: cleanRoma })
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
/** 上次给原生歌词播放器对齐的位置（毫秒）与时刻，用于算它自己跑到了哪 */
let lrcAnchor = { pos: -1, at: 0 }

export const handlePlay = (time: number) => {
  lrcAnchor = { pos: time, at: Date.now() }
  lrcResync(time)
  void playDesktopLyric(time)
}

/**
 * 允许的最大时钟偏差（毫秒）
 *
 * 这个值直接决定「一句歌词的最后一个字能不能唱完」。
 *
 * lrc-file-parser 内部是纯 wall clock 推算：`起始位置 + (now - 起始时刻)`，
 * 与音频实际播放位置无关。音频一旦因缓冲、解码、网络抖动停顿 200~400ms，
 * 它的时钟就永久超前同样多 —— 于是每句都在最后一个字唱完之前切到下一句，
 * 表现就是「歌词只渲染了一半，最后几个字不亮直接跳走」。
 *
 * 这个偏差是恒定的，不是累积的，所以只要每秒校一次就能压住。
 * 阈值取 60ms：小于一个字（中文歌约 150~250ms/字）的 1/3，
 * 视觉上最后一次字能完整点亮；再小会撞上 getPosition 自身的 ±20~30ms 抖动。
 */
const DRIFT_TOLERANCE = 60

/**
 * 校正歌词内部时钟的漂移（毫秒）
 *
 * 只在播放中调用（每秒一次）。resync 是无感的：它只重置内部时间基准与行定时器，
 * 行号没变就不会回调 onPlay，正在跑的逐字动画不受影响。
 */
export const syncLyricDrift = (time: number) => {
  if (lrcAnchor.pos < 0) return
  const predicted = lrcAnchor.pos + (Date.now() - lrcAnchor.at)
  if (Math.abs(time - predicted) < DRIFT_TOLERANCE) return
  // 重排前先更新基准，避免 handlePlay 里再次递归
  lrcAnchor = { pos: time, at: Date.now() }
  lrcResync(time)
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
  // 注意：这里刻意不再联动桌面歌词。
  // 桌面歌词有独立的 desktopLyric.showTranslation 开关（设置 → 桌面歌词 → 显示翻译），
  // 之前两边写同一个原生字段，导致「App 内关掉翻译后桌面歌词也没了翻译，
  // 但设置页那个开关还显示是开着的」这种自相矛盾的状态。
  if (playerState.isPlay) play()
}

/**
 * toggle show roma lyric
 * @param isShowLyricRoma is show roma lyric
 */
export const toggleRoma = async(isShowLyricRoma: boolean) => {
  lrcToggleRoma(isShowLyricRoma)
  // 同上：桌面歌词的音译由 desktopLyric 自己的设置控制
  if (playerState.isPlay) play()
}

export const play = () => {
  void getPosition().then((position) => {
    handlePlay(position * 1000)
  })
}

/**
 * 按指定位置强制对齐歌词（毫秒）
 *
 * 原生歌词播放器是按行排定时器自己往前跑的，单曲循环重播、拖回开头这类
 * 「播放位置大幅回退」不会触发 play 事件，必须显式重新对齐，
 * 否则桌面歌词 / 通知栏会一直停在上一轮的当前行。
 */
export const syncLyricPosition = (positionMs: number) => {
  handlePlay(positionMs)
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
