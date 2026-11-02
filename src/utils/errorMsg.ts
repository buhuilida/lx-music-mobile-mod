/**
 * 把底层请求错误转成人能看懂的提示。
 *
 * 之前各平台页面直接把 err.message 弹出来，用户会看到
 * 「try max num」「Network request failed」这类英文内部错误。
 */
export const friendlyError = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  if (!msg) return '操作失败，请稍后重试'
  if (/try max num/i.test(msg)) return '请求多次重试仍失败，可能被平台限流，请稍后再试'
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return '网络超时，请检查网络后重试'
  if (/Network request failed|Failed to fetch|ENOTFOUND|ECONNREFUSED|ECONNRESET|socket/i.test(msg)) {
    return '网络连接失败，请检查网络或代理设置'
  }
  if (/未设置Cookie|未登录|login/i.test(msg)) return '登录状态已失效，请重新登录'
  if (msg.includes('401') || msg.includes('403')) return '登录状态已失效，请重新登录'
  if (msg.includes('404')) return '接口不存在或已下线'
  if (/50\d/.test(msg)) return '平台服务异常，请稍后再试'
  return msg
}
