import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import {
  buildLyricInfoJson,
  buildEmptyLyricInfoJson,
  type LyricTrackMeta,
} from '@/utils/lyricInfo'

/**
 * 系统歌词（ColorOS / OPlus 原生锁屏歌词链路）
 *
 * ColorOS 16/17 的锁屏歌词、AOD 与锁屏岛走系统原生管线：SystemUI 直接读取当前
 * MediaSession 的 `MediaMetadata["lyricInfo"]`（JSON 字符串）。
 * 契约见 ColorOS-Live-Lyrics-Bridge《播放器接入协议》，字段生成见 utils/lyricInfo.ts。
 *
 * 这里只负责：取当前歌曲信息 → 生成 payload → 通过 TrackPlayer 写回 metadata。
 * 注意不要逐行改写 metadata：既无意义，又会触发高频 Binder 事务。
 */

let lastValue = ''
/** 每次真正换曲自增，避免系统把上一首的歌词当成当前歌曲的缓存 */
let sessionGeneration = 0
let inited = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

const getCurrentMusicInfo = (): LX.Music.MusicInfo | null => {
  const info = playerState.playMusicInfo.musicInfo
  if (!info) return null
  return 'progress' in info ? info.metadata.musicInfo : info
}

const getTrackMeta = (): LyricTrackMeta => {
  const info = getCurrentMusicInfo()
  const fallback = playerState.musicInfo
  if (!info) {
    return { songName: fallback.name ?? '', artist: fallback.singer ?? '', album: fallback.album ?? '' }
  }
  const interval = Number(info.interval) || 0
  return {
    songName: info.name,
    artist: info.singer,
    album: info.meta.albumName ?? '',
    songId: String(info.id),
    trackKey: `${info.id}|${info.name}|${info.singer}|${interval}`,
  }
}

const send = (value: string) => {
  void updateNowPlayingTitles({ lyricInfo: value }).catch(() => {})
}

const push = (value: string) => {
  if (value == lastValue) return
  lastValue = value
  send(value)
  // 歌词可能在播放器 metadata 就绪之前就加载完（原生侧会丢弃），补发两次
  if (retryTimer) clearTimeout(retryTimer)
  if (!value) return
  retryTimer = setTimeout(() => {
    if (lastValue == value) send(value)
    // 部分 ColorOS 在轨道 metadata 重建（封面加载）后才会接受 extras
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (lastValue == value) send(value)
    }, 3000)
  }, 1200)
}

/**
 * 把整首歌词推送给系统（切歌或歌词加载完成后调用）
 */
export const publishSystemLyric = (lyric: string, translation = '', wordLyric?: string) => {
  if (!settingState.setting['player.systemLyric']) return
  const payload = buildLyricInfoJson({
    lyric,
    translation,
    wordLyric: wordLyric ?? playerState.musicInfo.lxlrc ?? undefined,
    autoWordLyric: true,
    meta: getTrackMeta(),
    generation: sessionGeneration,
  })
  push(payload ?? '')
}

/**
 * 清空系统歌词（切歌、停止播放、关闭开关时调用）
 */
export const clearSystemLyric = (bumpGeneration = true) => {
  if (bumpGeneration) sessionGeneration++
  push('')
}

/**
 * 开关变化后同步一次
 */
export const refreshSystemLyric = () => {
  if (!settingState.setting['player.systemLyric']) {
    clearSystemLyric()
    return
  }
  const { lrc, tlrc } = playerState.musicInfo
  if (lrc) publishSystemLyric(lrc, tlrc ?? '')
}

/**
 * 无歌词歌曲：显式告诉系统「本曲没有歌词」，避免锁屏一直显示上一首的歌词
 */
export const markSystemLyricEmpty = () => {
  push(buildEmptyLyricInfoJson(getTrackMeta(), sessionGeneration))
}

export const initSystemLyric = () => {
  if (inited) return
  inited = true
  global.state_event.on('playMusicInfoChanged', () => {
    // 换曲：先摘掉上一首的歌词，新歌词由 lyric 模块加载完成后发布
    clearSystemLyric()
  })
}
