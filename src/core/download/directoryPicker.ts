import commonState from '@/store/common/state'
import { navigations } from '@/navigation'

/**
 * 下载目录选择器（1.19.0）
 *
 * 用 Promise 的方式打开目录选择页：设置页 await 结果即可，
 * 避免通过 RNN 的 passProps 传函数（序列化后容易失效）。
 */
let resolver: ((path: string | null) => void) | null = null

export const pickDownloadDirectory = async(initialPath?: string): Promise<string | null> => {
  const homeId = commonState.componentIds.home
  if (!homeId) return Promise.resolve(null)
  // 上一次没结束时先回掉，避免 Promise 悬挂
  resolver?.(null)
  return new Promise<string | null>((resolve) => {
    resolver = resolve
    navigations.pushDirectoryPickerScreen(homeId, initialPath)
  })
}

export const finishPickDirectory = (path: string | null) => {
  const resolve = resolver
  resolver = null
  resolve?.(path)
}

export const cancelPickDirectory = () => {
  finishPickDirectory(null)
}
