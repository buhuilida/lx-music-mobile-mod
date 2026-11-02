import { memo, useState } from 'react'
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import Input from '@/components/common/Input'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { useListenTogetherStatus } from '@/store/listenTogether/hook'
import { createRoom, joinRoom } from '@/core/listenTogether'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const savedServerUrl = useSettingValue('listenTogether.serverUrl')
  const savedNickname = useSettingValue('listenTogether.nickname')
  const { status } = useListenTogetherStatus()

  const [serverUrl, setServerUrl] = useState(savedServerUrl)
  const [nickname, setNickname] = useState(savedNickname)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')

  const isConnecting = status == 'connecting' || status == 'reconnecting'

  const handleServerUrlChange = (text: string) => {
    setServerUrl(text)
  }
  const handleServerUrlBlur = () => {
    updateSetting({ 'listenTogether.serverUrl': serverUrl.trim() })
  }
  const handleNicknameChange = (text: string) => {
    setNickname(text.slice(0, 20))
  }
  const handleCodeChange = (text: string) => {
    setCode(text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))
  }
  const handlePasswordChange = (text: string) => {
    setPassword(text.slice(0, 32))
  }

  const saveServerUrl = () => {
    updateSetting({ 'listenTogether.serverUrl': serverUrl.trim() })
  }

  const handleCreate = () => {
    saveServerUrl()
    createRoom({ nickname, password })
  }
  const handleJoin = () => {
    saveServerUrl()
    joinRoom({ code, nickname, password })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={{ ...styles.hero, backgroundColor: theme['c-primary-light-1000-alpha-200'], borderBottomColor: theme['c-border-background'] }}>
        <Text size={24} color={theme['c-primary']} style={styles.heroTitle}>{t('listen_together')}</Text>
        <Text size={13} color={theme['c-font-label']} style={styles.heroDesc}>{t('listen_together_desc')}</Text>
      </View>

      <View style={styles.section}>
        <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('listen_together_server')}</Text>
        <Input
          value={serverUrl}
          onChangeText={handleServerUrlChange}
          onBlur={handleServerUrlBlur}
          placeholder="ws://192.168.1.10:23333"
          placeholderTextColor={theme['c-font-label']}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
        />
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('listen_together_server_tip')}</Text>
      </View>

      <View style={styles.section}>
        <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('listen_together_nickname')}</Text>
        <Input
          value={nickname}
          onChangeText={handleNicknameChange}
          placeholder={t('listen_together_nickname_placeholder')}
          placeholderTextColor={theme['c-font-label']}
          maxLength={20}
          style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.codeContent}>
            <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('listen_together_room_code')}</Text>
            <Input
              value={code}
              onChangeText={handleCodeChange}
              placeholder={t('listen_together_code_placeholder')}
              placeholderTextColor={theme['c-font-label']}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
            />
          </View>
          <View style={styles.passwordContent}>
            <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('listen_together_password')}</Text>
            <Input
              value={password}
              onChangeText={handlePasswordChange}
              placeholder={t('listen_together_password_placeholder')}
              placeholderTextColor={theme['c-font-label']}
              secureTextEntry
              maxLength={32}
              style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
            />
          </View>
        </View>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('listen_together_join_tip')}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={{ ...styles.actionBtn, marginRight: 10, backgroundColor: theme['c-button-background'], opacity: isConnecting ? 0.6 : 1 }}
          disabled={isConnecting}
          onPress={handleCreate}
        >
          <Text size={15} color={theme['c-button-font']}>{t('listen_together_create')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ ...styles.actionBtn, backgroundColor: theme['c-button-background'], opacity: isConnecting ? 0.6 : 1 }}
          disabled={isConnecting}
          onPress={handleJoin}
        >
          <Text size={15} color={theme['c-button-font']}>{t('listen_together_join')}</Text>
        </TouchableOpacity>
      </View>

      {
        isConnecting
          ? (
            <View style={styles.connecting}>
              <ActivityIndicator size="small" color={theme['c-primary']} />
              <Text size={12} color={theme['c-font-label']} style={styles.connectingText}>{t('listen_together_connecting')}</Text>
            </View>
            )
          : null
      }

      <View style={styles.featureList}>
        <Text size={12} color={theme['c-font-label']} style={styles.featureTitle}>{t('listen_together_feature_title')}</Text>
        <Text size={12} color={theme['c-font-label']} style={styles.featureItem}>{`· ${t('listen_together_feature_1')}`}</Text>
        <Text size={12} color={theme['c-font-label']} style={styles.featureItem}>{`· ${t('listen_together_feature_2')}`}</Text>
        <Text size={12} color={theme['c-font-label']} style={styles.featureItem}>{`· ${t('listen_together_feature_3')}`}</Text>
      </View>
    </ScrollView>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  hero: {
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 26,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: 1,
    marginBottom: 22,
  },
  heroTitle: {
    fontWeight: 'bold',
  },
  heroDesc: {
    marginTop: 8,
    lineHeight: 18,
  },
  section: {
    paddingHorizontal: 22,
    marginBottom: 18,
  },
  label: {
    marginBottom: 6,
  },
  input: {
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 10,
    height: 40,
  },
  tip: {
    marginTop: 6,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
  },
  codeContent: {
    flex: 1,
    marginRight: 10,
  },
  passwordContent: {
    width: 130,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connecting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  connectingText: {
    marginLeft: 8,
  },
  featureList: {
    paddingHorizontal: 22,
    marginTop: 30,
  },
  featureTitle: {
    marginBottom: 8,
  },
  featureItem: {
    lineHeight: 20,
  },
})
