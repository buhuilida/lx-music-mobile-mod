import { compareVer } from '@/utils'
import { downloadNewVersion, getVersionInfo } from '@/utils/version'
import versionActions from '@/store/version/action'
import versionState, { type InitState } from '@/store/version/state'
import { getIgnoreVersion, getIgnoreVersionFailTipTime, saveIgnoreVersion, saveIgnoreVersionFailTipTime } from '@/utils/data'
import { showVersionModal } from '@/navigation'
import { Navigation } from 'react-native-navigation'
import { toast } from '@/utils/tools'

export const showModal = () => {
  if (versionState.showModal) return
  versionActions.setVisibleModal(true)
  showVersionModal()
}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async(): Promise<{ isLatest: boolean, isUnknown: boolean }> => {
  versionActions.setVersionInfo({ status: 'checking' })
  let versionInfo: InitState['versionInfo'] = { ...versionState.versionInfo }
  try {
    const { version, desc, history } = await getVersionInfo()
    versionInfo.newVersion = {
      version,
      desc,
      history,
    }
  } catch (err) {
    versionInfo.newVersion = {
      version: '0.0.0',
      desc: '',
      history: [],
    }
  }
  // const versionInfo = {
  //   version: '1.9.0',
  //   desc: '- 更新xxx\n- 修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达',
  //   history: [{ version: '1.8.0', desc: '- 更新xxx22\n- 修复xxx22' }, { version: '1.7.0', desc: '- 更新xxx22\n- 修复xxx22' }],
  // }
  if (versionInfo.newVersion.version == '0.0.0') {
    versionInfo.isUnknown = true
    versionInfo.status = 'error'
  } else {
    versionInfo.status = 'idle'
    versionInfo.isUnknown = false
    // 必须每次都显式赋值。
    // 旧写法只在「发现新版」时置 true，不更新时沿用上一次的状态，
    // 于是只要查过一次「已是最新」，isLatest 就永远是 true：
    // 之后哪怕服务端版本号涨了、弹窗里也显示了新版本号，界面依旧写着「已是最新」。
    versionInfo.isLatest = compareVer(versionInfo.version, versionInfo.newVersion.version) != -1
  }

  versionActions.setVersionInfo(versionInfo)

  if (!versionInfo.isLatest) {
    if (versionInfo.isUnknown) {
      const time = await getIgnoreVersionFailTipTime()
      if (Date.now() - time < 7 * 86400000) return { isLatest: false, isUnknown: true }
      saveIgnoreVersionFailTipTime(Date.now())
      toast(global.i18n.t('version_tip_unknown'))
    } else if (versionInfo.newVersion.version != await getIgnoreVersion()) {
      showModal()
    }
  }
  // 设置页「检查更新」按钮需要知道检查结果（1.22.16）
  return { isLatest: versionInfo.isLatest ?? false, isUnknown: versionInfo.isUnknown ?? false }
}

export const downloadUpdate = () => {
  versionActions.setVersionInfo({ status: 'downloading' })
  versionActions.setProgress({ total: 0, current: 0 })

  downloadNewVersion(versionState.versionInfo.newVersion!.version, (total: number, current: number) => {
    // console.log(total, current)
    versionActions.setProgress({ total, current })
  }).then(() => {
    versionActions.setVersionInfo({ status: 'downloaded' })
  }).catch(() => {
    versionActions.setVersionInfo({ status: 'error' })
    // console.log(err)
  })
}


export const setIgnoreVersion = (version: InitState['ignoreVersion']) => {
  versionActions.setIgnoreVersion(version)
  saveIgnoreVersion(version)
}
