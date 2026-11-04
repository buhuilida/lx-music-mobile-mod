import '@/utils/errorHandle'
import { init as initLog } from '@/utils/log'
import { bootLog, getBootLog } from '@/utils/bootLog'
import '@/config/globalData'
import { getFontSize } from '@/utils/data'
import { exitApp } from './utils/nativeModules/utils'
import { windowSizeTools } from './utils/windowSizeTools'
import { listenLaunchEvent } from './navigation/regLaunchedEvent'
import { tipDialog } from './utils/tools'
import { getUnsafeNativeArgs } from './utils/safeNativeArgs'
import { getNativeArgIssues } from './utils/nativeArgGuard'
import { dlog, dlogSessionStart, dlogFlush } from './utils/debugLog'

// 调试版：把每次启动写进日志文件，方便按启动批次对照问题
dlogSessionStart((process as any).versions?.app ?? 'unknown')
dlog('app', 'starting app...')

// 未捕获异常 / 未处理的 Promise 拒绝都记下来。
// 播放链路里大量使用 `void somePromise()`，失败时不会有任何提示，
// 这里能把「悄悄失败」的那一步抓出来。
const hermesInternal: any = (global as any).HermesInternal
if (typeof hermesInternal?.enablePromiseRejectionTracker === 'function') {
  hermesInternal.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (id: number, error: any) => {
      dlog('unhandled-rejection', `#${id}`, error?.message ?? error)
    },
    onHandled: () => {},
  })
}

const errorUtils: any = (global as any).ErrorUtils
const prevGlobalHandler = typeof errorUtils?.getGlobalHandler === 'function' ? errorUtils.getGlobalHandler() : null
if (typeof errorUtils?.setGlobalHandler === 'function') {
  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    dlog('js-error', isFatal ? 'FATAL' : 'non-fatal', error?.name, error?.message, error?.stack)
    void dlogFlush()
    if (prevGlobalHandler) prevGlobalHandler(error, isFatal)
  })
}
listenLaunchEvent()

void Promise.all([getFontSize(), windowSizeTools.init()]).then(async([fontSize]) => {
  global.lx.fontSize = fontSize
  bootLog('Font size setting loaded.')

  let isInited = false
  let handlePushedHomeScreen: () => void | Promise<void>

  const tryGetBootLog = () => {
    try {
      return getBootLog()
    } catch (err) {
      return 'Get boot log failed.'
    }
  }

  const handleInit = async() => {
    if (isInited) return
    void initLog()
    const { default: init } = await import('@/core/init')
    try {
      handlePushedHomeScreen = await init()
    } catch (err: any) {
      void tipDialog({
        title: '初始化失败 (Init Failed)',
        message: `Boot Log:\n${tryGetBootLog()}\n\n${(err.stack ?? err.message) as string}`,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
      return
    }
    isInited ||= true
    // 原生数值参数自检：有异常就直接弹出来，方便反馈（不阻断使用）
    const unsafeArgs = [...new Set([...getNativeArgIssues(), ...getUnsafeNativeArgs()])]
    if (unsafeArgs.length) {
      setTimeout(() => {
        void tipDialog({
          title: `原生参数异常（${unsafeArgs.length}）`,
          message: unsafeArgs.join('\n'),
          btnText: '知道了',
          bgClose: true,
        })
      }, 1500)
    }
  }
  const { init: initNavigation, navigations } = await import('@/navigation')

  initNavigation(async() => {
    await handleInit()
    if (!isInited) return
    // import('@/utils/nativeModules/cryptoTest')

    await navigations.pushHomeScreen().then(() => {
      void handlePushedHomeScreen()
    }).catch((err: any) => {
      void tipDialog({
        title: 'Error',
        message: err.message,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
    })
  })
}).catch((err) => {
  void tipDialog({
    title: '初始化失败 (Init Failed)',
    message: `Boot Log:\n\n${(err.stack ?? err.message) as string}`,
    btnText: 'Exit',
    bgClose: false,
  }).then(() => {
    exitApp()
  })
})
