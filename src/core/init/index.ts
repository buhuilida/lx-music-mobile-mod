import { initSetting, showPactModal } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initSync from './sync'
import initCommonState from './common'
import { initDeeplink } from './deeplink'
import { initListenTogether } from '@/core/listenTogether'
import { initDownload } from '@/core/download'
import { initSongNotify } from '@/core/player/notify'
import { initSystemLyric } from '@/core/player/systemLyric'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { checkUpdate } from '@/core/version'
import { bootLog } from '@/utils/bootLog'
import { cheatTip } from '@/utils/tools'

let isFirstPush = true
const handlePushedHomeScreen = async() => {
  await cheatTip()
  if (settingState.setting['common.isAgreePact']) {
    if (isFirstPush) {
      isFirstPush = false
      void checkUpdate()
      void initDeeplink()
    }
  } else {
    if (isFirstPush) isFirstPush = false
    showPactModal()
  }
}

let isInited = false
export default async() => {
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  const setting = await initSetting()
  bootLog('Setting inited.')
  // console.log(setting)

  await initTheme(setting)
  bootLog('Theme inited.')
  await initI18n(setting)
  bootLog('I18n inited.')

  await initUserApi(setting)
  bootLog('User Api inited.')

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  await initPlayer(setting)
  bootLog('Player inited.')
  await dataInit(setting)
  bootLog('Data inited.')
  await initCommonState(setting)
  bootLog('Common State inited.')

  initListenTogether()
  bootLog('Listen Together inited.')

  void initDownload()
  bootLog('Download inited.')

  initSongNotify()
  initSystemLyric()
  bootLog('Song notify inited.')

  void initSync(setting)
  bootLog('Sync inited.')

  // WebDAV 自动备份：启动时静默检查频率，不阻塞主流程（1.15.0）
  if (setting['common.isAgreePact']) {
    void import('@/core/sync/webdavAuto').then(({ checkWebdavAutoBackup }) => checkWebdavAutoBackup()).catch(() => {})
  }

  // syncSetting()

  isInited ||= true

  return handlePushedHomeScreen
}
