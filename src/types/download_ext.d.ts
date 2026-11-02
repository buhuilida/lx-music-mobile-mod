declare namespace LX {
  namespace Download {
    /**
     * 已下载（缓存）到本地的歌曲
     */
    interface ExtItem {
      id: string
      musicInfo: LX.Music.MusicInfoOnline
      quality: LX.Quality
      filePath: string
      fileName: string
      ext: string
      size: number
      createdAt: number
    }

    type ExtTaskStatus = 'waiting' | 'downloading' | 'completed' | 'error'

    interface ExtTask {
      id: string
      status: ExtTaskStatus
      /** 0 - 100 */
      progress: number
      downloaded: number
      total: number
      /** bytes per second */
      speed: number
      message?: string
    }
  }
}
