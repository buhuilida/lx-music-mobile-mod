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
import { parseFavorites, serializeFavorites } from '@/core/baiduPan/favorites'
import { waitForFavoriteSelection } from '@/core/baiduPan/selection'

/**
 * 下载保存位置：本地 / 百度网盘
 *
 * - 网盘选项未登录时置灰并提示先登录
 * - 保存目录可选网盘上的任意文件夹
 * - 任务创建时快照保存位置，改设置只影响之后的任务
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const auth = useBaiduPanAuth()
  const saveTarget = useSettingValue('download.saveTarget')
  const panDir = useSettingValue('download.baiduPanDir')
  const deleteLocal = useSettingValue('download.deleteLocalAfterUpload')
  const favorites = parseFavorites(useSettingValue('download.baiduPanFavorites'))

  /** 打开目录页，选中的目录加入常用列表（不改默认保存目录） */
  const addFavorite = useCallback(() => {
    if (!auth) {
      toast(t('setting_download_save_target_baidu_tip'))
      return
    }
    const componentId = getComponentId()
    if (!componentId) return
    waitForFavoriteSelection((path) => {
      const next = favorites.includes(path) ? favorites : [...favorites, path]
      updateSetting({ 'download.baiduPanFavorites': serializeFavorites(next) })
      toast(`${t('baidu_pan_favorite_added')} · ${path}`)
    })
    navigations.pushBaiduPanDirScreen(componentId)
  }, [auth, favorites, t])

  const removeFavorite = (path: string) => {
    updateSetting({ 'download.baiduPanFavorites': serializeFavorites(favorites.filter((item) => item !== path)) })
  }

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
    if (componentId) navigations.pushBaiduPanDirScreen(componentId)
  }, [auth, t])

  const handleLogout = useCallback(async() => {
    const confirm = await confirmDialog({ message: t('setting_download_baidu_logout') })
    if (!confirm) return
    await clearBaiduPanAuth()
    if (saveTarget === 'baiduPan') updateSetting({ 'download.saveTarget': 'local' })
    toast(t('baidu_pan_logout_success'))
  }, [saveTarget, t])

  return (
    <SubTitle title={t('setting_download_save_target')}>
      <View style={styles.row}>
        <CheckBox
          check={saveTarget === 'local'}
          label={t('setting_download_save_target_local')}
          onChange={() => { updateSetting({ 'download.saveTarget': 'local' }) }}
          need
        />
      </View>
      <View style={styles.row}>
        <CheckBox
          check={saveTarget === 'baiduPan'}
          label={t('setting_download_save_target_baidu')}
          onChange={() => {
            if (!auth) {
              toast(t('setting_download_save_target_baidu_tip'))
              return
            }
            updateSetting({ 'download.saveTarget': 'baiduPan' })
          }}
          disabled={!auth}
          need
        />
      </View>
      {!auth
        ? <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_download_save_target_baidu_tip')}</Text>
        : null}

      <View style={styles.dirRow}>
        <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.dirText}>
          {`${t('setting_download_baidu_dir')}：${panDir || '/'}`}
        </Text>
        <Button onPress={openDirPicker} disabled={!auth}>{t('setting_download_baidu_dir_select')}</Button>
      </View>

      <View style={styles.favWrap}>
        <Text size={12} color={theme['c-font-label']} style={styles.favTitle}>
          {t('setting_download_baidu_favorites')}
        </Text>
        {favorites.map((dir) => (
          <View key={dir} style={styles.favRow}>
            <Text numberOfLines={1} size={12} style={styles.favPath}>{dir}</Text>
            <Button onPress={() => removeFavorite(dir)}>{t('baidu_pan_delete')}</Button>
          </View>
        ))}
        <View style={styles.favRow}>
          <Button onPress={addFavorite} disabled={!auth}>{t('setting_download_baidu_favorites_add')}</Button>
        </View>
      </View>

      <View style={styles.row}>
        <CheckBox
          check={deleteLocal}
          label={t('setting_download_delete_local')}
          onChange={(check) => { updateSetting({ 'download.deleteLocalAfterUpload': check }) }}
          disabled={saveTarget !== 'baiduPan'}
          need
        />
      </View>

      <View style={styles.accountRow}>
        {auth
          ? (
            <>
              <Text size={12} color={theme['c-font-label']} numberOfLines={1} style={styles.dirText}>
                {t('setting_download_baidu_logged_in')}
              </Text>
              <Button onPress={() => { void handleLogout() }}>{t('setting_download_baidu_logout')}</Button>
            </>
            )
          : <Button onPress={openLogin}>{t('setting_download_baidu_login')}</Button>}
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  row: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  tip: {
    marginLeft: 25,
    marginBottom: 4,
  },
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  dirText: {
    flex: 1,
    marginRight: 8,
  },
  favWrap: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  favTitle: {
    marginBottom: 4,
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 3,
  },
  favPath: {
    flex: 1,
    marginRight: 8,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
})
