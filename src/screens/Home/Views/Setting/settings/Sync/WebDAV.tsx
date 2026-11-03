import { memo, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import InputItem from '../../components/InputItem'
import Button from '../../components/Button'
import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { updateSetting } from '@/core/common'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { testConnection, WebDAVError, normalizeWebdavUrl } from '@/core/sync/webdav'
import { pushWebDAVScreen } from '@/navigation'
import commonState from '@/store/common/state'
import { backupToWebdav, readWebdavMeta, restoreFromWebdav, type WebdavMeta } from '@/core/sync/webdavBackup'

const formatTime = (at: number) => {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const url = useSettingValue('sync.webdavUrl')
  const user = useSettingValue('sync.webdavUser')
  const password = useSettingValue('sync.webdavPassword')
  const webdavAuto = useSettingValue('sync.webdavAuto')

  const [busy, setBusy] = useState<'' | 'test' | 'backup' | 'restore'>('')
  const [cloudMeta, setCloudMeta] = useState<WebdavMeta | null>(null)

  const getConfig = () => {
    const serverUrl = normalizeWebdavUrl(url)
    if (!serverUrl) {
      toast(t('setting_webdav_tip_empty_url'))
      return null
    }
    return { url: serverUrl, user: user.trim(), password }
  }

  const withBusy = async(type: typeof busy, action: () => Promise<void>) => {
    if (busy) return
    setBusy(type)
    try {
      await action()
    } catch (err) {
      const code = err instanceof WebDAVError ? err.code : ''
      const keyMap = {
        bad_url: 'setting_webdav_tip_empty_url',
        bad_auth: 'setting_webdav_tip_empty_auth',
        auth_failed: 'setting_webdav_tip_auth_failed',
        no_backup: 'setting_webdav_tip_no_backup',
        network: 'setting_webdav_tip_network',
      } as const
      const key = keyMap[code as keyof typeof keyMap]
      toast(t(key ?? 'setting_webdav_tip_failed', { msg: (err as Error).message ?? '' }))
    } finally {
      setBusy('')
    }
  }

  const handleOpenCloud = () => {
    const homeId = commonState.componentIds.home
    if (!homeId) return
    pushWebDAVScreen(homeId)
  }

  const handleTest = async() => {
    await withBusy('test', async() => {
      const config = getConfig()
      if (!config) return
      await testConnection(config)
      toast(t('setting_webdav_test_ok'))
    })
  }

  const handleBackup = async() => {
    await withBusy('backup', async() => {
      const config = getConfig()
      if (!config) return
      const meta = await backupToWebdav(config)
      setCloudMeta(meta)
      toast(t('setting_webdav_backup_ok', { musics: meta.counts.musics }))
    })
  }

  const handleRestore = () => {
    void confirmDialog({
      message: t('setting_webdav_restore_confirm'),
      confirmButtonText: t('setting_webdav_restore'),
    }).then(async(isConfirm) => {
      if (!isConfirm) return
      await withBusy('restore', async() => {
        const config = getConfig()
        if (!config) return
        const meta = await restoreFromWebdav(config)
        setCloudMeta(meta)
        toast(t('setting_webdav_restore_ok', { musics: meta.counts.musics }))
      })
    })
  }

  const handleCheckMeta = async() => {
    await withBusy('test', async() => {
      const config = getConfig()
      if (!config) return
      const meta = await readWebdavMeta(config)
      setCloudMeta(meta)
      toast(t('setting_webdav_meta', { time: formatTime(meta.at) }))
    })
  }

  const metaText = cloudMeta
    ? t('setting_webdav_meta', { time: formatTime(cloudMeta.at) }) +
      ` · ${t('setting_webdav_meta_counts', { lists: cloudMeta.counts.lists, musics: cloudMeta.counts.musics, apis: cloudMeta.counts.userApis })}`
    : null

  return (
    <SubTitle title={t('setting_webdav')}>
      <InputItem
        value={url}
        label={t('setting_webdav_url')}
        onChanged={(value) => { updateSetting({ 'sync.webdavUrl': value.trim() }) }}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://dav.jianguoyun.com/dav/"
      />
      <InputItem
        value={user}
        label={t('setting_webdav_user')}
        onChanged={(value) => { updateSetting({ 'sync.webdavUser': value.trim() }) }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('setting_webdav_user_placeholder')}
      />
      <InputItem
        value={password}
        label={t('setting_webdav_password')}
        onChanged={(value) => { updateSetting({ 'sync.webdavPassword': value }) }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('setting_webdav_password_placeholder')}
      />
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_webdav_tip')}</Text>
      <View style={styles.autoContent}>
        <Text size={13} color={theme['c-600']}>{t('setting_webdav_auto')}</Text>
        <View style={styles.autoBtns}>
          {(['off', 'startup', 'daily', 'weekly'] as const).map(mode => {
            const active = webdavAuto == mode
            return (
              <CommonButton
                key={mode}
                onPress={() => { updateSetting({ 'sync.webdavAuto': mode }) }}
                style={[styles.autoBtn, { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] }]}
              >
                <Text size={12} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{t(`setting_webdav_auto_${mode}`)}</Text>
              </CommonButton>
            )
          })}
        </View>
      </View>
      <View style={styles.btnContent}>
        <Button onPress={handleTest} disabled={!!busy}>{t('setting_webdav_test')}</Button>
        <Button onPress={handleBackup} disabled={!!busy}>{busy == 'backup' ? t('setting_webdav_busy') : t('setting_webdav_backup')}</Button>
        <Button onPress={handleCheckMeta} disabled={!!busy}>{t('setting_webdav_check')}</Button>
        <Button onPress={handleRestore} disabled={!!busy}>{busy == 'restore' ? t('setting_webdav_busy') : t('setting_webdav_restore')}</Button>
        <Button onPress={handleOpenCloud}>{t('setting_webdav_open_cloud')}</Button>
      </View>
      {
        metaText != null && <Text size={11} color={theme['c-font-label']} style={styles.meta}>{metaText}</Text>
      }
    </SubTitle>
  )
})

const styles = createStyle({
  tip: {
    paddingLeft: 25,
    marginTop: -6,
    marginBottom: 10,
    lineHeight: 16,
    paddingRight: 15,
  },
  btnContent: {
    paddingLeft: 25,
    paddingRight: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  meta: {
    paddingLeft: 25,
    marginTop: -4,
  },
  autoContent: {
    paddingLeft: 25,
    paddingRight: 15,
    marginBottom: 10,
  },
  autoBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  autoBtn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
})
