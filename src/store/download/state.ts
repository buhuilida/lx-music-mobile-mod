export interface InitState {
  /**
   * 已下载（缓存）到本地的歌曲列表
   */
  list: LX.Download.ExtItem[]
  /**
   * 正在进行的下载任务，key 为歌曲 id + 音质
   */
  tasks: Record<string, LX.Download.ExtTask>
}

const state: InitState = {
  list: [],
  tasks: {},
}

export default state
