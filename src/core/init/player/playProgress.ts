import { updateListMusics } from '@/core/list'
import { setMaxplayTime, setNowPlayTime } from '@/core/player/progress'
import { setCurrentTime, getDuration, getPosition } from '@/plugins/player'
import { formatPlayTime2 } from '@/utils/common'
import { savePlayInfo } from '@/utils/data'
import { throttleBackgroundTimer } from '@/utils/tools'
import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { onScreenStateChange } from '@/utils/nativeModules/utils'
import { AppState } from 'react-native'
import { safeNum } from '@/utils/safeNativeArgs'
import { dlog } from '@/utils/debugLog'

const delaySavePlayInfo = throttleBackgroundTimer(() => {
  void savePlayInfo({
    time: playerState.progress.nowPlayTime,
    maxTime: playerState.progress.maxPlayTime,
    listId: playerState.playMusicInfo.listId!,
    index: playerState.playInfo.playIndex,
  })
}, 2000)

export default () => {
  // const updateMusicInfo = useCommit('list', 'updateMusicInfo')

  let updateTimeout: number | null = null

  let isScreenOn = true
  /** 上一次读到的播放位置（秒），用于识别「回绕」 */
  let lastPosition = -1

  let tickCount = 0
  const getCurrentTime = () => {
    let id = playerState.musicInfo.id
    const readAt = Date.now()
    void getPosition().then(position => {
      tickCount++
      if (tickCount % 10 == 0) dlog('progress', '进度采样', 'position=' + position, 'isPlay=' + playerState.isPlay, 'tick=' + tickCount)
      if (!position || id != playerState.musicInfo.id) return
      /**
       * getPosition 是跨 bridge 的异步调用，返回的是「发起请求那一刻」的位置。
       * 直接把它写进 store，进度/歌词就永远慢一个来回（低端机上能到几百毫秒），
       * 逐字唱到句尾还差好几个字，看起来就是「后半句没唱就跳下一句」。
       * 这里按实际耗时补回来。
       */
      const elapsed = (Date.now() - readAt) / 1000
      const now = position + elapsed
      setNowPlayTime(now)
      if (!playerState.isPlay) return

      // 位置大幅回退说明这首歌从头重播了（单曲循环、点上一首、拖回开头）。
      // 原生歌词播放器是按行排定时器自己往前跑的，不重新对齐就会一直停在
      // 上一轮的当前行上，表现就是「歌词卡在最后一句，切歌才变」。
      if (lastPosition >= 0 && position + 2 < lastPosition) {
        global.app_event.lyricSeek(now * 1000)
      }
      lastPosition = position
      // 正常播放时音频位置和歌词内部时钟也会有慢慢分叉（缓冲、解码抖动），
      // 漂移超过 1.2s 才重排，避免频繁打断逐字动画。
      global.app_event.lyricDrift(now * 1000)

      if (settingState.setting['player.isSavePlayTime'] && !playerState.playMusicInfo.isTempPlay && isScreenOn) {
        delaySavePlayInfo()
      }
    })
  }
  const getMaxTime = async() => {
    setMaxplayTime(await getDuration())

    if (playerState.playMusicInfo.musicInfo && 'source' in playerState.playMusicInfo.musicInfo && !playerState.playMusicInfo.musicInfo.interval) {
      // console.log(formatPlayTime2(playProgress.maxPlayTime))

      if (playerState.playMusicInfo.listId) {
        void updateListMusics([{
          id: playerState.playMusicInfo.listId,
          musicInfo: {
            ...playerState.playMusicInfo.musicInfo,
            interval: formatPlayTime2(playerState.progress.maxPlayTime),
          },
        }])
      }
    }
  }

  const clearUpdateTimeout = () => {
    if (!updateTimeout) return
    clearInterval(updateTimeout)
    updateTimeout = null
    dlog('progress', '进度计时器已停止')
  }
  /**
   * 进度条的前进靠这个循环定时调用 getPosition()。
   *
   * 原实现用 BackgroundTimer.setInterval：它的 JS shim 每次回调后再调一次原生
   * RNBackgroundTimer.setTimeout 来续期。实测这个原生定时器会漏触发（我们在播放
   * 防抖上见过延迟 3~7 秒、以及完全不触发），而 setInterval 只要漏一次就永久停了 ——
   * 表现就是进度条卡住不动，拖动却能跳（拖动走的是 setProgress 事件，不依赖定时器）。
   * 这里改用 JS 定时器（JSTimers），由 JS 线程自己驱动。
   */
  const startUpdateTimeout = () => {
    if (!isScreenOn) {
      dlog('progress', '未启动进度计时器：屏幕状态为关闭')
      return
    }
    clearUpdateTimeout()
    const interval = safeNum(1000 / settingState.setting['player.playbackRate'], 1000, 'BackgroundTimer.interval')
    dlog('progress', '启动进度计时器', 'interval=' + interval)
    updateTimeout = setInterval(() => {
      getCurrentTime()
    }, interval) as unknown as number
    getCurrentTime()
  }

  const setProgress = (time: number, maxTime?: number) => {
    if (!playerState.musicInfo.id) return
    // console.log('setProgress', time, maxTime)
    setNowPlayTime(time)
    void setCurrentTime(time)

    if (maxTime != null) setMaxplayTime(maxTime)

    // if (!isPlay) audio.play()
  }


  const handlePlay = () => {
    void getMaxTime()
    // prevProgressStatus = 'normal'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    startUpdateTimeout()
  }
  const handlePause = () => {
    // prevProgressStatus = 'paused'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    // clearBufferTimeout()
    clearUpdateTimeout()
  }

  const handleStop = () => {
    lastPosition = -1
    clearUpdateTimeout()
    setNowPlayTime(0)
    setMaxplayTime(0)
    // prevProgressStatus = 'none'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
  }

  const handleError = () => {
    // if (!restorePlayTime) restorePlayTime = getCurrentTime() // 记录出错的播放时间
    // console.log('handleError')
    // prevProgressStatus = 'error'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    clearUpdateTimeout()
  }


  const handleSetPlayInfo = () => {
    lastPosition = -1
    // restorePlayTime = playProgress.nowPlayTime
    // void setCurrentTime(playerState.progress.nowPlayTime)
    // setMaxplayTime(playProgress.maxPlayTime)
    handlePause()
    if (!playerState.playMusicInfo.isTempPlay) {
      void savePlayInfo({
        time: playerState.progress.nowPlayTime,
        maxTime: playerState.progress.maxPlayTime,
        listId: playerState.playMusicInfo.listId!,
        index: playerState.playInfo.playIndex,
      })
    }
  }

  // watch(() => playerState.progress.nowPlayTime, (newValue, oldValue) => {
  //   if (settingState.setting['player.isSavePlayTime'] && !playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: newValue,
  //       maxTime: playerState.progress.maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })
  // watch(() => playerState.progress.maxPlayTime, maxPlayTime => {
  //   if (!playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: playerState.progress.nowPlayTime,
  //       maxTime: maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (keys.includes('player.playbackRate')) startUpdateTimeout()
  }

  const handleScreenStateChanged: Parameters<typeof onScreenStateChange>[0] = (state) => {
    isScreenOn = state == 'ON'
    if (isScreenOn) {
      if (playerState.isPlay) startUpdateTimeout()
    } else clearUpdateTimeout()
  }

  // 修复在某些设备上屏幕状态改变事件未触发导致的进度条未更新的问题
  AppState.addEventListener('change', (state) => {
    if (state == 'active' && !isScreenOn) handleScreenStateChanged('ON')
  })

  global.app_event.on('play', handlePlay)
  global.app_event.on('pause', handlePause)
  global.app_event.on('stop', handleStop)
  global.app_event.on('error', handleError)
  global.app_event.on('setProgress', setProgress)
  // global.app_event.on(eventPlayerNames.restorePlay, handleRestorePlay)
  // global.app_event.on('playerLoadeddata', handleLoadeddata)
  // global.app_event.on('playerCanplay', handleCanplay)
  // global.app_event.on('playerWaiting', handleWating)
  // global.app_event.on('playerEmptied', handleEmpied)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)

  onScreenStateChange(handleScreenStateChanged)
}
