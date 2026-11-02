import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { speak, stopSpeak, showIsland, hideIsland } from '@/utils/nativeExt'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { onLyricLinePlay } from '@/core/desktopLyric'

interface LyricLine {
  time: number
  text: string
}

const lrcLineRxp = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?](.*)$/

/**
 * 把 LRC 文本解析成按时间排序的歌词行
 */
export const parseLyricLines = (lrc: string | null | undefined): LyricLine[] => {
  if (!lrc) return []
  const lines: LyricLine[] = []
  for (const raw of lrc.split('\n')) {
    const match = lrcLineRxp.exec(raw.trim())
    if (!match) continue
    const min = parseInt(match[1], 10)
    const sec = parseInt(match[2], 10)
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
    const text = match[4].trim()
    if (!text) continue
    lines.push({ time: min * 60 + sec + ms / 1000, text })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}

let lyricLines: LyricLine[] = []
let lastIndex = -1
let lastMusicId: string | null = null
let islandVisible = false
let lastPushedLyric = ''
// 歌词播放器给出的当前行，比自行解析更可靠（桌面歌词用的就是它）
let currentLine = ''

/**
 * 把当前歌词写进媒体会话（MediaSession）。
 * ColorOS 17 / Android 16 的灵动岛与流体云卡片，音乐类应用读取的就是媒体会话的标题，
 * 因此这里同步一份歌词，岛上的胶囊与展开卡片都能显示当前一句。
 * 已开启「蓝牙歌词」时由原逻辑负责，避免互相覆盖。
 */
const pushLyricToMediaSession = (lyric: string) => {
  if (!lyric || lyric == lastPushedLyric) return
  // 已开启系统歌词（lyricInfo）时不要再改写标题：
  // 系统会按 MediaMetadata.lyricInfo 自己渲染歌词，标题被歌词覆盖反而会打断匹配
  if (settingState.setting['player.systemLyric']) return
  if (settingState.setting['player.isShowBluetoothLyric']) return
  const { musicInfo } = playerState
  if (!musicInfo.name) return
  lastPushedLyric = lyric
  void updateNowPlayingTitles({
    title: lyric,
    artist: musicInfo.singer ? `${musicInfo.name} - ${musicInfo.singer}` : musicInfo.name,
    album: musicInfo.album ?? '',
  })
}

const restoreMediaSessionTitles = () => {
  if (!lastPushedLyric) return
  lastPushedLyric = ''
  const { musicInfo } = playerState
  if (!musicInfo.name) return
  void updateNowPlayingTitles({
    title: musicInfo.name,
    artist: musicInfo.singer ?? '',
    album: musicInfo.album ?? '',
  })
}

const findLineIndex = (time: number) => {
  if (!lyricLines.length) return -1
  let low = 0
  let high = lyricLines.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lyricLines[mid].time <= time) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

const resetLyric = () => {
  lyricLines = parseLyricLines(playerState.musicInfo.lrc ?? playerState.musicInfo.rawlrc)
  lastIndex = -1
}

const getCurrentMusicInfo = (): LX.Music.MusicInfo | null => {
  const info = playerState.playMusicInfo.musicInfo
  if (!info) return null
  return 'progress' in info ? info.metadata.musicInfo : info
}

const buildNotifyText = () => {
  const musicInfo = getCurrentMusicInfo()
  if (!musicInfo) return ''
  const singer = musicInfo.singer ? `，${musicInfo.singer}` : ''
  return `${musicInfo.name}${singer}`
}

const handleSongChange = () => {
  const musicInfo = getCurrentMusicInfo()
  if (!musicInfo) {
    if (islandVisible) {
      hideIsland()
      islandVisible = false
    }
    return
  }

  // 歌词随歌曲变化，延迟一点等歌词加载完成
  currentLine = ''
  resetLyric()
  setTimeout(() => { resetLyric() }, 1200)

  if (musicInfo.id != lastMusicId) {
    lastMusicId = musicInfo.id
    if (settingState.setting['player.songNotify']) {
      const text = buildNotifyText()
      if (text) void speak(`正在播放 ${text}`, settingState.setting['player.songNotifyRate'])
    }
  }

  updateIsland(true)
}

const updateIsland = (force = false) => {
  if (!settingState.setting['player.islandLyric']) {
    if (islandVisible) {
      hideIsland()
      islandVisible = false
    }
    restoreMediaSessionTitles()
    return
  }
  const musicInfo = getCurrentMusicInfo()
  if (!musicInfo) {
    if (islandVisible) {
      hideIsland()
      islandVisible = false
    }
    return
  }

  const { nowPlayTime, maxPlayTime } = playerState.progress
  const index = findLineIndex(nowPlayTime)
  if (!force && index == lastIndex && islandVisible) return
  lastIndex = index

  const lyric = currentLine || (index >= 0 ? lyricLines[index]?.text : '')
  const percent = maxPlayTime > 0 ? Math.floor(nowPlayTime / maxPlayTime * 100) : -1

  pushLyricToMediaSession(lyric)

  showIsland({
    title: musicInfo.name,
    text: lyric || musicInfo.singer || '',
    sub: musicInfo.singer,
    playing: playerState.isPlay,
    percent,
  })
  islandVisible = true
}

const handleProgress = () => {
  if (!settingState.setting['player.islandLyric']) return
  updateIsland()
}

const handlePlayState = () => {
  updateIsland(true)
  if (!playerState.isPlay) void stopSpeak()
}

let inited = false
export const initSongNotify = () => {
  if (inited) return
  inited = true
  global.state_event.on('playMusicInfoChanged', handleSongChange)
  global.state_event.on('playProgressChanged', handleProgress)
  global.state_event.on('playStateChanged', handlePlayState)
  global.state_event.on('playerMusicInfoChanged', () => {
    // 歌词加载完成后刷新一次
    resetLyric()
    updateIsland(true)
  })
  onLyricLinePlay(({ text }) => {
    currentLine = text ?? ''
    if (!settingState.setting['player.islandLyric']) return
    updateIsland(true)
  })
}

/**
 * 设置变更后立即生效
 */
export const refreshSongNotify = () => {
  if (!settingState.setting['player.islandLyric']) {
    hideIsland()
    islandVisible = false
  } else {
    updateIsland(true)
  }
  if (!settingState.setting['player.songNotify']) void stopSpeak()
}
