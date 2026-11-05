import { init as initLyricPlayer, toggleTranslation, toggleRoma, play, pause, stop, setLyric, setPlaybackRate, syncLyricPosition, syncLyricDrift } from '@/core/lyric'
import { updateSetting } from '@/core/common'
import { onDesktopLyricPositionChange, showDesktopLyric, onLyricLinePlay, showRemoteLyric } from '@/core/desktopLyric'
import playerState from '@/store/player/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { setLastLyric } from '@/core/player/playInfo'

const updateRemoteLyric = async(lrc?: string) => {
  setLastLyric(lrc)
  if (lrc == null) {
    void updateNowPlayingTitles({
      title: playerState.musicInfo.name,
      artist: playerState.musicInfo.singer ?? '',
      album: playerState.musicInfo.album ?? '',
    })
  } else {
    void updateNowPlayingTitles({
      title: lrc,
      artist: `${playerState.musicInfo.name}${playerState.musicInfo.singer ? ` - ${playerState.musicInfo.singer}` : ''}`,
      album: playerState.musicInfo.album ?? '',
    })
  }
}

export default async(setting: LX.AppSetting) => {
  await initLyricPlayer()
  await Promise.all([
    setPlaybackRate(setting['player.playbackRate']),
    toggleTranslation(setting['player.isShowLyricTranslation']),
    toggleRoma(setting['player.isShowLyricRoma']),
  ])

  if (setting['desktopLyric.enable']) {
    showDesktopLyric().catch(() => {
      updateSetting({ 'desktopLyric.enable': false })
    })
  }
  if (setting['player.isShowBluetoothLyric']) {
    showRemoteLyric(true).catch(() => {
      updateSetting({ 'player.isShowBluetoothLyric': false })
    })
  }
  onDesktopLyricPositionChange(position => {
    updateSetting({
      'desktopLyric.position.x': position.x,
      'desktopLyric.position.y': position.y,
    })
  })
  onLyricLinePlay(({ text, extendedLyrics }) => {
    if (!text && !playerState.isPlay) {
      void updateRemoteLyric()
    } else {
      void updateRemoteLyric(text)
    }
  })


  // 注意：这里刻意不做「切前后台自动显隐」。
  // 原版桌面歌词是用户手动开启后常驻的悬浮窗，回到 App 也照样显示、可以拖动位置；
  // 之前加过一段 AppState 监听（active 就 hide），结果一回到 App 歌词就消失，
  // 用户看到的现象是「根本没有桌面歌词」。切前台时是否需要隐藏由用户自己关开关决定。

  global.app_event.on('play', play)
  global.app_event.on('pause', pause)
  global.app_event.on('stop', stop)
  global.app_event.on('error', pause)
  global.app_event.on('musicToggled', stop)
  global.app_event.on('lyricUpdated', setLyric)
  // 播放位置回绕（单曲循环重播 / 拖回开头）：重新对齐歌词行
  global.app_event.on('lyricSeek', syncLyricPosition)
  // 音频缓冲后歌词内部时钟会超前，偏差过大时重新对齐，避免「没唱完就跳下一句」
  global.app_event.on('lyricDrift', syncLyricDrift)
}
