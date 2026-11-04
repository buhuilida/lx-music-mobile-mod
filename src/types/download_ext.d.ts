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
      /** 本条目上传使用的网盘目录（任务创建时快照，重试沿用它） */
      panDir?: string
      /** 百度网盘上传状态（保存位置选网盘时才有） */
      upload?: {
        status: 'uploading' | 'success' | 'fail'
        /** 0 - 100 */
        progress: number
        errorMsg?: string
        remotePath?: string
      }
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
      /** 百度网盘上传状态（保存位置选网盘时才有） */
      upload?: {
        status: 'uploading' | 'success' | 'fail'
        /** 0 - 100 */
        progress: number
        errorMsg?: string
        remotePath?: string
      }
    }
  }
}
