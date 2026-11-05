import { memo, useCallback } from 'react'
import { View } from 'react-native'

import CheckBox from '@/components/common/CheckBox'
import Text from '@/components/common/Text'
import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import commonState from '@/store/common/state'
import { navigations } from '@/navigation'
import { clearBaiduPanAuth, useBaiduPanAuth } from '@/core/baiduPan/auth'
import { clearDirSelection } from '@/core/baiduPan/selection'

/**
 * 百度网盘上传相关设置。
 *
 * 「保存位置（本地 / 百度网盘）」这个开关不放在这里——它本质上是「这次下载存哪儿」，
 * 放在网盘页里选更直观（打开网盘页 → 选下载位置），设置页只留网盘侧的必要配置：
 * 账号、默认保存目录、上传完成后是否删本地。
 *
 * 常用目录（收藏）也只在网盘页用 ★ 维护，不再在设置里列表展示。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const auth = useBaiduPanAuth()
  const panDir = useSettingValue('download.baiduPanDir')
  const saveTarget = useSettingValue('download.saveTarget')
  const deleteLocal = useSettingValue('download.deleteLocalAfterUpload')

  const getComponentId = () => {
    const ids = commonState.componentIds
    return ids.home ?? ids.playDetail ?? Object.values(ids)[0]
  }

  const openLogin = useCallback(() => {
    const componentId = getComponentId()
    if (componentId) navigations.pushBaiduPanLoginScreen(componentId)
  }, [])

  const openDirPicker = useCallback(() => {
    if (!auth) {
      toast(t('setting_download_save_target_baidu_tip'))
      return
    }
    const componentId = getComponentId()
    if (!componentId) return
    // 不登记任何待处理回调：目录页确认时会走「设为默认保存目录」的分支
    clearDirSelection()
    navigations.pushBaiduPanDirScreen(componentId)
  }, [auth, t])

  const handleLogout = useCallback(async() => {
    const confirm = await confirmDialog({ message: t('setting_download_baidu_logout') })
    if (!confirm) return
    await clearBaiduPanAuth()
    if (saveTarget == 'baiduPan') updateSetting({ 'download.saveTarget': 'local' })
    toast(t('baidu_pan_logout_success'))
  }, [saveTarget, t])

  return (
    <SubTitle title={t('setting_download_baidu_section')}>
      <View style={styles.row}>
        {auth
          ? (
            <>
              <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.flexText}>
                {t('setting_download_baidu_logged_in')}
              </Text>
              <Button onPress={() => { void handleLogout() }}>{t('setting_download_baidu_logout')}</Button>
            </>
            )
          : <Button onPress={openLogin}>{t('setting_download_baidu_login')}</Button>}
      </View>

      <View style={styles.row}>
        <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.flexText}>
          {`${t('setting_download_baidu_dir')}：${panDir || '/'}`}
        </Text>
        <Button onPress={openDirPicker} disabled={!auth}>{t('setting_download_baidu_dir_select')}</Button>
      </View>

      <View style={styles.row}>
        <CheckBox
          check={deleteLocal}
          label={t('setting_download_delete_local')}
          onChange={(check) => { updateSetting({ 'download.deleteLocalAfterUpload': check }) }}
          disabled={saveTarget != 'baiduPan'}
          need
        />
      </View>

      <Text size={11} color={theme['c-font-label']} style={styles.tip}>
        {`${t('setting_download_current', {
          value: saveTarget == 'baiduPan'
            ? `${t('setting_download_save_target_baidu')} · ${panDir || '/'}`
            : t('setting_download_save_target_local'),
        })}　${t('setting_download_baidu_tip')}`}
      </Text>
    </SubTitle>
  )
})

const styles = createStyle({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 5,
  },
  flexText: {
    flex: 1,
    marginRight: 8,
  },
  tip: {
    marginLeft: 25,
    marginTop: 2,
    lineHeight: 16,
  },
})
