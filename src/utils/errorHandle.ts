import { Alert } from 'react-native'
// import { exitApp } from '@/utils/common'
import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler'
import Clipboard from '@react-native-clipboard/clipboard'
import { log } from '@/utils/log'
import { toast } from './tools'
import { appendFile, temporaryDirectoryPath } from '@/utils/fs'

const buildReport = (e: Error, isFatal: boolean) => {
  return [
    `time: ${new Date().toISOString()}`,
    `fatal: ${isFatal}`,
    `name: ${e?.name ?? ''}`,
    `message: ${e?.message ?? ''}`,
    'stack:',
    e?.stack ?? '(no stack)',
  ].join('\n')
}

/** 把错误追加到日志文件，方便用户「设置-其他-错误日志」里复制反馈 */
const persistError = (report: string) => {
  try {
    void appendFile(`${temporaryDirectoryPath}/crash.log`, `\n==== lx crash ====\n${report}\n`).catch(() => {})
  } catch {}
}

const errorHandler = (e: Error, isFatal: boolean) => {
  const excludedErrors = [
    'Failed to construct \'Response\'',
  ]
  if (isFatal) {
    if (excludedErrors.some((excludedError) => e.message?.includes(excludedError))) {
      toast('应用遇到了错误，如果你有固定的复现方式，请截图并在 GitHub 反馈（并附上具体的操作步骤，以及“设置-错误日志”的内容）')
    } else {
      const report = buildReport(e, isFatal)
      persistError(report)
      Alert.alert(
        '💥应用出错了💥',
        `
  应用遇到了一个异常，当前操作可能已经中断。

  ${e.name}: ${e.message}

  如果反复出现，请点击「复制错误信息」后反馈给开发者（并说明刚才做了什么操作）。
  `,
        [
          {
            text: '复制错误信息',
            onPress: () => {
              Clipboard.setString(report)
              toast('错误信息已复制')
            },
          },
          { text: '关闭', style: 'cancel' },
        ],
      )
    }
  }
  log.error(e.stack)
}

if (process.env.NODE_ENV !== 'development') {
  setJSExceptionHandler(errorHandler)

  setNativeExceptionHandler((errorString) => {
    log.error(errorString)
    persistError(`[native]\n${errorString}`)
    console.log('+++++', errorString, '+++++')
  }, false)
}
