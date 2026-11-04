/**
 * 原生方法「数值参数」守卫
 *
 * 背景：RN 桥接层把 JS 参数打包成 ReadableNativeArray，原生方法声明为 float / int / double
 * 时会在 JavaMethodWrapper 里直接强转。一旦那个位置收到对象（ReadableNativeMap），
 * 就会抛 ClassCastException —— 这个异常在 JS 侧 try/catch 不到，整个 App 直接闪退。
 *
 * 所以所有「数值参数」的原生调用统一走 safeNum：类型不对就退回默认值，并记一条诊断，
 * 让问题退化成「某个功能数值不对」而不是「一点就崩」。
 */
import { log } from '@/utils/log'

const MAX_REPORT = 12
const issues: string[] = []

/** 取出本次运行记录到的参数异常（供启动后弹窗自检用） */
export const getUnsafeNativeArgs = () => issues

const describe = (value: any) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value !== 'object') return String(value)
  try {
    const json = JSON.stringify(value)
    return json.length > 160 ? `${json.slice(0, 160)}…` : json
  } catch {
    return '[object]'
  }
}

/**
 * 把任意值收敛成可安全传给原生数值参数的数字
 * @param value 原始值
 * @param fallback 非法时的兜底值
 * @param label 诊断用标签（哪个调用）
 */
export const safeNum = (value: any, fallback = 0, label = ''): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (issues.length < MAX_REPORT) {
    const msg = `${label}: ${typeof value} = ${describe(value)}`
    if (!issues.includes(msg)) {
      issues.push(msg)
      log.warn('[native-args] ' + msg)
      console.warn('[native-args] ' + msg)
    }
  }
  return fallback
}
