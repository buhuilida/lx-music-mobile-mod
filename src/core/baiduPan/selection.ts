/**
 * 目录选择的「回调桥」
 *
 * react-native-navigation 的页面返回不好带返回值，这里用模块级的待处理回调：
 * 调用方先登记回调再打开目录页，目录页确认时按优先级处理：
 *   1. 选目录（播放页「下载到网盘」）→ 回传路径
 *   2. 加常用目录（设置页）→ 写入常用列表
 *   3. 都没登记 → 当作「设置默认保存目录」
 */

let pendingPick: ((path: string) => void) | null = null
let pendingFavorite: ((path: string) => void) | null = null

/** 播放页：选一个目录，选完直接开始下载上传 */
export const waitForDirSelection = (onPicked: (path: string) => void) => {
  pendingPick = onPicked
  pendingFavorite = null
}

/** 设置页：把选中的目录加进常用列表 */
export const waitForFavoriteSelection = (onPicked: (path: string) => void) => {
  pendingFavorite = onPicked
  pendingPick = null
}

/** @returns true 表示这次确认已经被某个待处理动作消费，调用方不要再改设置 */
export const consumeDirSelection = (path: string): boolean => {
  if (pendingPick) {
    const cb = pendingPick
    pendingPick = null
    cb(path)
    return true
  }
  if (pendingFavorite) {
    const cb = pendingFavorite
    pendingFavorite = null
    cb(path)
    return true
  }
  return false
}

export const clearDirSelection = () => {
  pendingPick = null
  pendingFavorite = null
}
