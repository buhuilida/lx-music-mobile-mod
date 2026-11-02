import { memo } from 'react'
import { Linking, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import InputItem from '../../components/InputItem'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { updateSetting } from '@/core/common'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { createStyle, toast } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const serverUrl = useSettingValue('listenTogether.serverUrl')
  const webUrl = useSettingValue('listenTogether.webUrl')
  const nickname = useSettingValue('listenTogether.nickname')

  const openWeb = () => {
    const url = webUrl.trim()
    if (!url) {
      toast(t('listen_together_web_empty'))
      return
    }
    void Linking.openURL(url).catch(() => {
      toast(t('listen_together_web_failed'))
    })
  }

  const openListenTogether = () => {
    const componentId = commonState.componentIds.home
    if (!componentId) return
    navigations.pushListenTogetherScreen(componentId)
  }

  return (
    <SubTitle title={t('listen_together')}>
      <View style={styles.content}>
        <InputItem
          value={serverUrl}
          label={t('listen_together_server')}
          onChanged={(value) => { updateSetting({ 'listenTogether.serverUrl': value.trim() }) }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ws://192.168.1.10:23333"
        />
        <InputItem
          value={nickname}
          label={t('listen_together_nickname')}
          onChanged={(value) => { updateSetting({ 'listenTogether.nickname': value.trim().slice(0, 20) }) }}
          maxLength={20}
          placeholder={t('listen_together_nickname_placeholder')}
        />
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('listen_together_server_tip')}</Text>
        <InputItem
          value={webUrl}
          label={t('listen_together_web')}
          onChanged={(value) => { updateSetting({ 'listenTogether.webUrl': value.trim() }) }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('listen_together_web_placeholder')}
        />
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('listen_together_web_tip')}</Text>
        <View style={styles.btnContent}>
          <Button onPress={openListenTogether}>{t('listen_together_open')}</Button>
          <Button onPress={openWeb}>{t('listen_together_open_web')}</Button>
        </View>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    // InputItem 自带左侧留白
  },
  tip: {
    paddingLeft: 25,
    marginTop: -6,
    marginBottom: 10,
    lineHeight: 16,
  },
  btnContent: {
    paddingLeft: 25,
    flexDirection: 'row',
    alignItems: 'center',
  },

})
