import playerState from '@/store/player/state'
import ltState from '@/store/listenTogether/state'
import ltActions from '@/store/listenTogether/action'
import { setLockedLyric, clearLockedLyric, setLyricPublisher } from '@/core/lyric'
import client from './instance'

/**
 * 歌词同步
 *
 * 两端即使播放同一首歌，不同音源拿到的歌词、时间轴也可能不一样（甚至有的源没有歌词），
 * 所以由房主把自己正在用的歌词推给房间，成员直接锁定使用，保证同一句歌词在同一秒出现。
 */

const getCurrentMusic = (): LX.Music.MusicInfo | null => {
  const musicInfo = playerState.playMusicInfo.musicInfo
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

/** 先按 id + 音源匹配，匹配不上再按歌名 + 歌手兜底（成员可能用了别的音源） */
const isSameMusic = (lyric: LX.ListenTogether.LyricSnapshot, music: LX.Music.MusicInfo) => {
  if (lyric.musicId == music.id && lyric.source == music.source) return true
  return lyric.name == music.name && lyric.singer == music.singer
}

let pendingLyric: LX.ListenTogether.LyricSnapshot | null = null

/** 本机是否是房间播放源（房主，或成员在房间无播放状态时成为了播放源） */
const isPlaybackSource = () => ltState.isHost || ltState.playbackSourceId == ltState.selfId

const applyIfMatch = () => {
  const lyric = pendingLyric
  if (!lyric || isPlaybackSource()) return
  const music = getCurrentMusic()
  if (!music || !isSameMusic(lyric, music)) return
  pendingLyric = null

  ltActions.setLyric(lyric)
  if (!lyric.lrc) {
    clearLockedLyric()
    return
  }
  setLockedLyric(music.id, lyric.lrc, lyric.tlrc, lyric.rlrc)
}

/**
 * 收到房间推送的歌词（房主或播放源成员）
 */
export const applyRemoteLyric = (lyric: LX.ListenTogether.LyricSnapshot) => {
  if (isPlaybackSource() || !lyric) return
  pendingLyric = lyric
  applyIfMatch()
}

/**
 * 房主歌词更新时推送到房间
 */
const publishLyric = (payload: { lrc: string, tlrc: string, rlrc: string }) => {
  if (!isPlaybackSource() || ltState.status != 'connected' || !ltState.room) return
  const music = getCurrentMusic()
  if (!music) return
  const snapshot: Omit<LX.ListenTogether.LyricSnapshot, 'at'> = {
    musicId: music.id,
    source: music.source,
    name: music.name,
    singer: music.singer,
    lrc: payload.lrc,
    tlrc: payload.tlrc,
    rlrc: payload.rlrc,
  }
  ltActions.setLyric({ ...snapshot, at: Date.now() })
  client.sendLyric(snapshot)
}

export const initLyricSync = () => {
  setLyricPublisher(publishLyric)
  global.state_event.on('playMusicInfoChanged', applyIfMatch)
}

export const resetLyricSync = () => {
  pendingLyric = null
  clearLockedLyric()
  ltActions.setLyric(null)
  // 退出房间后恢复使用本地歌词
  global.app_event.lyricUpdated()
}
