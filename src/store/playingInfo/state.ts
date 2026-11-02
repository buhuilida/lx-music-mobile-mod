const state = {
  /** 当前实际播放音质（如 320k / flac），空串表示未知 */
  quality: '',
  /** 当前实际播放音源（如 kw / wy），空串表示未知 */
  source: '',
  /** 本次请求的音质档位（用户设置），用于区分「母带请求但文件是 FLAC」的情况 */
  requested: '',
}

export default state
