import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'

/**
 * 系统歌词（ColorOS / OPlus 原生歌词链路）
 *
 * ColorOS 16/17 的锁屏歌词、AOD 与灵动岛胶囊，音乐类应用走的是系统原生链路：
 * SystemUI 会读取当前 MediaSession 的 `MediaMetadata["lyricInfo"]`，
 * 里面是一段 JSON，携带带时间轴的 LRC 全文（可附翻译）。
 * 见 ColorOS-Live-Lyrics-Bridge 的 LyricInfoContract。
 *
 * 这里把 LX Music 的歌词按同一份契约推送给系统，由系统自己完成滚动与高亮，
 * 不再需要把歌词塞进歌曲标题，也不会污染通知栏。
 */

const PROVIDER = 'lx-music-mobile'
const timedLrcRxp = /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?]/

let lastValue = ''
// 每次切歌自增，避免系统把上一首的歌词当成当前歌曲的缓存
let sessionGeneration = 0
let inited = false

const getCurrentMusicInfo = (): LX.Music.MusicInfo | null => {
  const info = playerState.playMusicInfo.musicInfo
  if (!info) return null
  return 'progress' in info ? info.metadata.musicInfo : info
}

const getTrackKey = (info: LX.Music.MusicInfo | null) => {
  if (!info) return ''
  return `${info.source}_${info.id}`
}

/**
 * 生成符合 OPlus lyricInfo 契约的 JSON 字符串，歌词不可用时返回 null
 */
export const buildLyricInfoPayload = (lyric: string, translation = ''): string | null => {
  if (!lyric || !timedLrcRxp.test(lyric)) return null
  const info = getCurrentMusicInfo()
  const translationLyric = translation && timedLrcRxp.test(translation) ? translation : ''
  return JSON.stringify({
    songName: info?.name ?? playerState.musicInfo.name ?? '',
    artist: info?.singer ?? playerState.musicInfo.singer ?? '',
    album: info?.meta.albumName ?? playerState.musicInfo.album ?? '',
    songId: info?.id ?? '',
    lyric,
    rawLyric: '',
    translationLyric,
    provider: PROVIDER,
    trackKey: getTrackKey(info),
    sessionGeneration,
    source: 'lx-music',
  })
}

let retryTimer: ReturnType<typeof setTimeout> | null = null

const send = (value: string) => {
  void updateNowPlayingTitles({ lyricInfo: value }).catch(() => {})
}

const push = (value: string) => {
  if (value == lastValue) return
  lastValue = value
  send(value)
  // 歌词可能在播放器 metadata 就绪之前就加载完（此时原生侧会丢弃），补发一次
  if (retryTimer) clearTimeout(retryTimer)
  if (!value) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (lastValue == value) send(value)
  }, 1200)
}

/**
 * 把整首歌词推送给系统（切歌或歌词加载完成后调用）
 */
export const publishSystemLyric = (lyric: string, translation = '') => {
  if (!settingState.setting['player.systemLyric']) return
  push(buildLyricInfoPayload(lyric, translation) ?? '')
}

/**
 * 锁屏歌词兜底：把当前歌词行写进 MediaSession 的 artist 字段。
 * 部分机型的锁屏媒体卡片不消费 lyricInfo，但一定显示 artist，
 * 与主流音乐 App 一致（歌名在上、当前歌词行在下）。
 */
export const publishSystemLyricLine = (line: string) => {
  if (!settingState.setting['player.systemLyric']) return
  if (!line) return
  void updateNowPlayingTitles({ artist: line }).catch(() => {})
}

/**
 * 清空系统歌词（切歌、停止播放、关闭开关时调用）
 */
export const clearSystemLyric = (bumpGeneration = true) => {
  if (bumpGeneration) sessionGeneration++
  push('')
  // 恢复 artist 为歌手名（歌词行兜底占用了该字段）
  const info = getCurrentMusicInfo()
  const singer = info?.singer ?? playerState.musicInfo.singer ?? ''
  if (singer) void updateNowPlayingTitles({ artist: singer }).catch(() => {})
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

export const initSystemLyric = () => {
  if (inited) return
  inited = true
  global.state_event.on('playMusicInfoChanged', () => {
    clearSystemLyric()
  })
}
