/**
 * 原生「数值参数」全局守卫（最后一道闸）
 *
 * 为什么需要第二道守卫：safeNum 只能覆盖源码里我们自己写的调用点，
 * 而第三方库内部（如 react-native-track-player 的 lib/trackPlayer.js）
 * 会在模块加载时缓存 NativeModules.TrackPlayerModule 并直接调用原生方法，
 * 这类调用绕过了我们的封装。
 *
 * 这里在 App 启动最早期（index.js 第一条 import）直接改写原生模块对象上的方法，
 * 把已知的 float / int 参数位置统一收敛成合法数字：
 *   - 合法数字原样透传，零开销
 *   - 非数字（对象 / undefined / NaN）退回兜底值，并记一条诊断
 *
 * 由于第三方库拿到的是同一个模块对象，改写方法对它同样生效。
 */
import { NativeModules } from 'react-native'
import { dlog } from '@/utils/debugLog'

const MAX_REPORT = 12
const issues: string[] = []

/** 本次运行记录到的参数异常（供启动后自检弹窗展示） */
export const getNativeArgIssues = () => issues

const describe = (value: any) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value !== 'object') return String(value)
  try {
    const json = JSON.stringify(value)
    return json == null ? '[object]' : json.length > 160 ? `${json.slice(0, 160)}…` : json
  } catch {
    return '[object]'
  }
}

const record = (label: string, value: any) => {
  if (issues.length >= MAX_REPORT) return
  const msg = `${label}: ${typeof value} = ${describe(value)}`
  if (issues.includes(msg)) return
  issues.push(msg)
  console.warn('[native-args] ' + msg)
}

type Rule = {
  /** 原生模块名 */
  module: string
  /** 方法名 */
  method: string
  /** 参数下标 -> 非法时的兜底值 */
  indexes: Record<number, number>
}

const RULES: Rule[] = [
  // 播放器（vendor/react-native-track-player，均为 float 参数）
  { module: 'TrackPlayerModule', method: 'seekTo', indexes: { 0: 0 } },
  { module: 'TrackPlayerModule', method: 'setVolume', indexes: { 0: 1 } },
  { module: 'TrackPlayerModule', method: 'setRate', indexes: { 0: 1 } },
  // 第一个参数是 float duration —— 历史上这里被整个对象顶替过，必崩
  { module: 'TrackPlayerModule', method: 'updateNowPlayingTitles', indexes: { 0: 0 } },
  // 桌面歌词（float / int）
  { module: 'LyricModule', method: 'setPlaybackRate', indexes: { 0: 1 } },
  { module: 'LyricModule', method: 'setAlpha', indexes: { 0: 1 } },
  { module: 'LyricModule', method: 'setTextSize', indexes: { 0: 20 } },
  { module: 'LyricModule', method: 'play', indexes: { 0: 0 } },
  { module: 'LyricModule', method: 'setMaxLineNum', indexes: { 0: 2 } },
  { module: 'LyricModule', method: 'setWidth', indexes: { 0: 0 } },
  // 语音播报：speak(text, rate)
  { module: 'Ext', method: 'speak', indexes: { 1: 1 } },
  // 音效（int 参数）
  { module: 'AudioEffect', method: 'setBandLevel', indexes: { 0: 0, 1: 0 } },
  { module: 'AudioEffect', method: 'setBassBoost', indexes: { 0: 0 } },
  { module: 'AudioEffect', method: 'setVirtualizer', indexes: { 0: 0 } },
  { module: 'AudioEffect', method: 'setLoudnessGain', indexes: { 0: 0 } },
  // 后台定时器（int / double）
  { module: 'RNBackgroundTimer', method: 'setTimeout', indexes: { 0: 0, 1: 0 } },
  { module: 'RNBackgroundTimer', method: 'start', indexes: { 0: 0 } },
  { module: 'RNBackgroundTimer', method: 'clearTimeout', indexes: { 0: 0 } },
]

const wrap = (rule: Rule) => {
  const mod = (NativeModules as Record<string, any>)[rule.module]
  if (!mod) return
  const original = mod[rule.method]
  if (typeof original !== 'function') return

  const wrapped = function (...args: any[]) {
    for (const key of Object.keys(rule.indexes)) {
      const index = Number(key)
      if (index >= args.length) continue
      const value = args[index]
      if (typeof value === 'number' && Number.isFinite(value)) continue
      record(`${rule.module}.${rule.method}#${index + 1}`, value)
      args[index] = rule.indexes[index]
    }
    return original.apply(mod, args)
  }

  try {
    Object.defineProperty(mod, rule.method, {
      value: wrapped,
      writable: true,
      configurable: true,
      enumerable: true,
    })
  } catch {
    try {
      mod[rule.method] = wrapped
    } catch {
      // 模块被冻结，放弃该条（不影响其它规则）
    }
  }
}

RULES.forEach(wrap)


/**
 * 播放器原生调用的「进出」追踪（仅调试版使用）。
 *
 * 排查「一直显示链接获取中 / 点了没反应」时，最有效的信息是：
 * 某个原生方法只打了「发出」，却始终没有「返回」——说明卡在那一次调用上。
 */
const TRACE_METHODS = [
  'setupPlayer', 'getCurrentTrack', 'add', 'skip', 'play', 'pause', 'stop', 'reset',
  'seekTo', 'getQueue', 'remove', 'getPosition', 'getDuration', 'getPlaybackState',
  'setVolume', 'setRate', 'updateNowPlayingTitles', 'updateNowPlayingMetadata', 'load',
]

const traceModule = (moduleName: string) => {
  const mod = (NativeModules as Record<string, any>)[moduleName]
  if (!mod) return
  TRACE_METHODS.forEach((method) => {
    const original = mod[method]
    if (typeof original !== 'function' || (original as any).__traced) return
    const wrapped = function (...args: any[]) {
      const startedAt = Date.now()
      let result: any
      try {
        result = original.apply(mod, args)
      } catch (err: any) {
        dlog('native', `${moduleName}.${method} 同步抛错`, err?.message ?? err)
        throw err
      }
      if (result && typeof result.then === 'function') {
        return result.then((value: any) => {
          const cost = Date.now() - startedAt
          if (cost > 200) dlog('native', `${moduleName}.${method} ok (${cost}ms)`)
          return value
        }, (err: any) => {
          dlog('native', `${moduleName}.${method} 失败 (${Date.now() - startedAt}ms)`, err?.message ?? err)
          throw err
        })
      }
      return result
    }
    ;(wrapped as any).__traced = true
    try {
      Object.defineProperty(mod, method, { value: wrapped, writable: true, configurable: true })
    } catch {}
  })
}

traceModule('TrackPlayerModule')

/**
 * 把 BackgroundTimer 内部实现换成标准 JS 定时器。
 *
 * 这个库的安卓实现是每调用一次就 new Handler() 往「原生模块线程」上 postDelayed，
 * 并且 clearTimeout 在 Java 侧是被注释掉的（JS 只是删掉了自己的回调表）。
 * 实测在这台机器上它的回调会延迟 3~7 秒，甚至完全不触发：
 *   - 播放防抖的 100ms 定时器晚了 7.2 秒 → 「点了歌没反应，再点一次才播」
 *   - 播放延迟闸门的 500ms 复位定时器没触发 → isDelayRun 永久为 true，换源后再也播不出来
 *   - 进度条每秒一次的 setInterval 漏一次就永久停止 → 进度条不动
 *
 * 与其一个个改调用点，这里在启动最早期把它的方法整体换成 JSTimers。
 * 应用有前台播放服务，JS 线程在后台仍然存活，定时器照常触发。
 */
const patchBackgroundTimer = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-background-timer')
    const timer = mod?.default ?? mod
    if (!timer || (timer as any).__useJsTimers) return
    ;(timer as any).__useJsTimers = true

    timer.setTimeout = (callback: () => void, timeout = 0) => setTimeout(callback, timeout)
    timer.clearTimeout = (id: number) => clearTimeout(id)
    timer.setInterval = (callback: () => void, timeout = 0) => setInterval(callback, timeout)
    timer.clearInterval = (id: number) => clearInterval(id)
    // start/stop 是给 runBackgroundTimer 用的，保持原样（内部会调用 setTimeout）
    dlog('app', 'BackgroundTimer 已切换为 JS 定时器')
  } catch (err: any) {
    dlog('app', 'BackgroundTimer 替换失败', err?.message ?? err)
  }
}

patchBackgroundTimer()

