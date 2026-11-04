/**
 * 调试日志（仅用于排查播放链路问题）
 *
 * 为什么不用 console：发布包里 __DEV__ 为 false，RN 不会把 console 转发到 logcat，
 * 连着电脑也拿不到应用内的 console。这里改为直接写文件，并把同一份日志写到多个候选位置，
 * 只要有一个能写成功，就能把日志取出来：
 *   1. /sdcard/Download/lx-debug.log          手机「下载」目录，文件管理器里能直接看到（优先）
 *   2. /sdcard/Android/data/<包名>/files/lx-debug.log   应用外部私有目录，adb 可直接 pull
 *   3. 应用内部私有目录（没有存储权限时的兜底）
 *
 * 写入采用「攒一批再写」的方式，避免每条日志都跨一次桥拖慢播放线程；
 * 任何异常都静默处理，绝不影响主流程。
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024

const getCandidatePaths = (): string[] => {
  // 延迟 require：本模块可能在 RN 初始化完成前就被加载
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNFS = require('react-native-fs') as typeof import('react-native-fs')
  return [
    `${RNFS.DownloadDirectoryPath}/lx-debug.log`,
    `${RNFS.ExternalDirectoryPath}/lx-debug.log`,
    `${RNFS.DocumentDirectoryPath}/lx-debug.log`,
  ]
}

let activePath = ''
let buffer: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let isDisabled = false
let isFlushing = false
let droppedLines = 0

const pad = (num: number, len = 2) => String(num).padStart(len, '0')

const timeText = () => {
  const date = new Date()
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

const safeStringify = (value: any): string => {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    const json = JSON.stringify(value)
    return json == null ? String(value) : json.length > 400 ? `${json.slice(0, 400)}…` : json
  } catch {
    return '[unserializable]'
  }
}

const format = (tag: string, args: any[]) => {
  const body = args.map(safeStringify).join(' ')
  return `${timeText()} [${tag}] ${body}\n`
}

const rotateIfNeeded = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNFS = require('react-native-fs') as typeof import('react-native-fs')
    void RNFS.stat(activePath).then((stat) => {
      if ((Number(stat.size) || 0) < MAX_FILE_SIZE) return
      void RNFS.moveFile(activePath, `${activePath}.old`).catch(() => {})
    }).catch(() => {})
  } catch {}
}

const writeTo = async(path: string, data: string) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNFS = require('react-native-fs') as typeof import('react-native-fs')
  if (await RNFS.exists(path)) await RNFS.appendFile(path, data, 'utf8')
  else await RNFS.writeFile(path, data, 'utf8')
}

const flush = async() => {
  if (isFlushing || !buffer.length || isDisabled) return
  isFlushing = true
  const data = buffer.join('')
  buffer = []
  try {
    if (!activePath) {
      // 依次尝试候选路径，第一个写成功的固定下来
      for (const path of getCandidatePaths()) {
        try {
          await writeTo(path, data)
          activePath = path
          break
        } catch {}
      }
      if (!activePath) isDisabled = true
    } else {
      await writeTo(activePath, data)
    }
  } catch {
    // 目标路径不可用（例如权限被回收），下次重新挑路径
    activePath = ''
  } finally {
    isFlushing = false
  }
}

const scheduleFlush = () => {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, 600)
}

export const dlog = (tag: string, ...args: any[]) => {
  if (isDisabled) return
  if (buffer.length > 500) {
    droppedLines++
    return
  }
  if (droppedLines) {
    buffer.push(format('log', [`(丢弃 ${droppedLines} 条)`]))
    droppedLines = 0
  }
  buffer.push(format(tag, args))
  scheduleFlush()
}

/** 标记一次会话开始，写入分隔线，方便区分每次启动 */
export const dlogSessionStart = (version: string) => {
  buffer.push(`\n========== ${new Date().toLocaleString()} 启动 v${version} ==========\n`)
  scheduleFlush()
  // 等第一条日志把路径定下来后再判断是否需要滚动，避免文件无限增长
  setTimeout(() => {
    if (activePath) rotateIfNeeded()
  }, 2000)
}

/** 当前日志文件路径（写成功后可读，用于界面提示） */
export const getLogFilePath = () => activePath

/** 强制把缓冲区落盘（切后台、出错时调用） */
export const dlogFlush = () => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return flush()
}
