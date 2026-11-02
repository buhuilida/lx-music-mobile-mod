import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native'
import qrcodeModule from 'qrcode-generator'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import wyUser from '@/utils/musicSdk/wy/user'
import { loginNeteaseWithPhone, loginWithQrCookie, sendWyPhoneCode } from '@/core/netease'
import { loginQQWithPhone, sendQQPhoneCode } from '@/core/qq'
import { loginKgWithCookie } from '@/core/kugou'
import { friendlyError } from '@/utils/errorMsg'

/**
 * 平台登录弹窗（1.22.0）
 *
 * - 网易云：扫码 / 手机号（密码 + 短信验证码）
 * - QQ 音乐：手机号短信验证码（后端 LoginServer，无网页无滑块）
 * - 酷狗：Cookie 粘贴（手机登录需要客户端 RSA 加密，见说明）
 *
 * 1.21.x 的弹窗有两个真实缺陷，这一版一并修掉：
 * 1. 输入框写死 height: 40，系统字体放大时会裁掉上下半行，改成 minHeight + 内边距
 * 2. 弹窗没有滚动容器，键盘一弹整块被压缩，表单和二维码互相压住
 */

type Platform = 'wy' | 'tx' | 'kg'
type WyTab = 'qr' | 'phone'
type WyMode = 'password' | 'captcha'

// qrcode-generator 是 UMD 包，个别打包配置下 default 会变成 { default: fn }
const createQr = (): any => {
  const factory: any = qrcodeModule
  if (typeof factory === 'function') return factory
  if (factory && typeof factory.default === 'function') return factory.default
  return null
}

const QR_SIZE = 190
const POLL_INTERVAL = 2000
const SMS_COOLDOWN = 60

interface Props {
  visible: boolean
  platform?: Platform
  onClose: () => void
  onSuccess?: () => void
}

export default memo(({ visible, platform = 'wy', onClose, onSuccess }: Props) => {
  const t = useI18n()
  const theme = useTheme()

  const [wyTab, setWyTab] = useState<WyTab>('qr')
  const [modules, setModules] = useState<boolean[][]>([])
  const [status, setStatus] = useState<'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [mode, setMode] = useState<WyMode>('password')
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [cookieInput, setCookieInput] = useState('')

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const buildQr = useCallback((key: string) => {
    const factory = createQr()
    if (!factory) {
      setStatus('error')
      setMessage(t('wy_login_qr_failed'))
      return
    }
    try {
      const qr = factory(0, 'M')
      qr.addData(`https://music.163.com/login?codekey=${key}`)
      qr.make()
      const count = qr.getModuleCount()
      const grid: boolean[][] = []
      for (let row = 0; row < count; row++) {
        const line: boolean[] = []
        for (let col = 0; col < count; col++) line.push(Boolean(qr.isDark(row, col)))
        grid.push(line)
      }
      setModules(grid)
    } catch (err) {
      console.log('build qr error', err)
      setStatus('error')
      setMessage(t('wy_login_qr_failed'))
    }
  }, [t])

  const handleQrResult = useCallback(async(result: { code: number, cookie?: string, message?: string }) => {
    switch (result.code) {
      case 800:
        setStatus('expired')
        setMessage(t('wy_login_qr_expired'))
        stopPolling()
        break
      case 802:
        setStatus('scanned')
        setMessage(t('wy_login_qr_scanned'))
        break
      case 803: {
        stopPolling()
        setStatus('success')
        setMessage(t('wy_login_qr_success'))
        try {
          await loginWithQrCookie((result.cookie ?? '').split(';').map(item => item.trim()))
          if (!aliveRef.current) return
          toast(t('wy_login_success'))
          onSuccess?.()
          onClose()
        } catch (err) {
          setStatus('error')
          setMessage(err instanceof Error ? err.message : t('wy_login_failed'))
        }
        break
      }
      default:
        setStatus('waiting')
        setMessage(t('wy_login_qr_waiting'))
    }
  }, [onClose, onSuccess, stopPolling, t])

  const startPolling = useCallback((key: string) => {
    stopPolling()
    const poll = () => {
      void wyUser.checkQrLogin(key).then(async(raw: unknown) => {
        if (!aliveRef.current || keyRef.current != key) return
        await handleQrResult(raw as { code: number, cookie?: string, message?: string })
      }).catch(() => {})
    }
    // 先立刻查一次，再进定时器，避免第一轮永远空白
    poll()
    timerRef.current = setInterval(poll, POLL_INTERVAL)
  }, [handleQrResult, stopPolling])

  const refreshQr = useCallback(async() => {
    stopPolling()
    setModules([])
    setStatus('loading')
    setMessage(t('wy_login_qr_loading'))
    try {
      const key = (await wyUser.getQrKey()) as string
      if (!aliveRef.current) return
      keyRef.current = key
      buildQr(key)
      setStatus('waiting')
      setMessage(t('wy_login_qr_waiting'))
      startPolling(key)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : t('wy_login_failed'))
    }
  }, [buildQr, startPolling, stopPolling, t])

  const startCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    setCooldown(SMS_COOLDOWN)
    cooldownRef.current = setInterval(() => {
      setCooldown(value => {
        if (value <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return value - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    if (!visible) return
    setPassword('')
    setCaptcha('')
    setCookieInput('')
    setMessage('')
    setWyTab(platform == 'wy' ? 'qr' : 'phone')
  }, [visible, platform])

  useEffect(() => {
    aliveRef.current = true
    if (visible && platform == 'wy' && wyTab == 'qr') void refreshQr()
    else stopPolling()
    return () => {
      aliveRef.current = false
      stopPolling()
    }
  }, [visible, platform, wyTab, refreshQr, stopPolling])

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  const handleSendCode = useCallback(() => {
    if (cooldown > 0 || submitting) return
    if (!/^\d{6,15}$/.test(phone.trim())) {
      toast(t('wy_login_phone_invalid'))
      return
    }
    const task = platform == 'tx' ? sendQQPhoneCode(phone.trim()) : sendWyPhoneCode(phone.trim())
    void task
      .then((result) => {
        // QQ 音乐会把「需要安全验证」「发送太频繁」当成正常响应返回
        if (platform == 'tx' && result && typeof result === 'object') {
          if (result.event === 'captcha') {
            toast(t('qq_code_need_verify'), 'long')
            return
          }
          if (result.event === 'frequency') {
            toast(t('qq_code_frequency'), 'long')
            return
          }
        }
        toast(t('wy_login_code_sent'))
        startCooldown()
      })
      .catch((err: Error) => { toast(friendlyError(err), 'long') })
  }, [cooldown, phone, platform, startCooldown, submitting, t])

  const handlePhoneLogin = useCallback(() => {
    if (submitting) return
    if (!/^\d{6,15}$/.test(phone.trim())) {
      toast(t('wy_login_phone_invalid'))
      return
    }
    if (platform == 'wy' && mode == 'password' && !password) {
      toast(t('wy_login_password_empty'))
      return
    }
    if ((platform == 'tx' || mode == 'captcha') && !captcha) {
      toast(t('wy_login_captcha_empty'))
      return
    }
    setSubmitting(true)
    const task = platform == 'tx'
      ? loginQQWithPhone(phone.trim(), captcha.trim())
      : loginNeteaseWithPhone({
        phone: phone.trim(),
        password: mode == 'password' ? password : undefined,
        captcha: mode == 'captcha' ? captcha.trim() : undefined,
      })
    void task.then(() => {
      toast(t('wy_login_success'))
      onSuccess?.()
      onClose()
    }).catch((err: Error) => {
      toast(friendlyError(err), 'long')
    }).finally(() => {
      setSubmitting(false)
    })
  }, [captcha, mode, onClose, onSuccess, password, phone, platform, submitting, t])

  const handleCookieLogin = useCallback(() => {
    const value = cookieInput.trim()
    if (!value) {
      toast(t('wy_login_password_empty'))
      return
    }
    setSubmitting(true)
    void loginKgWithCookie(value).then(() => {
      toast(t('wy_login_success'))
      onSuccess?.()
      onClose()
    }).catch((err: Error) => {
      toast(friendlyError(err), 'long')
    }).finally(() => {
      setSubmitting(false)
    })
  }, [cookieInput, onClose, onSuccess, t])

  const title = platform == 'tx' ? 'QQ音乐' : platform == 'kg' ? '酷狗音乐' : '网易云'

  const renderQr = () => (
    <>
      <View style={styles.qrBox}>
        {
          modules.length
            ? <View style={{ width: QR_SIZE, height: QR_SIZE }}>
                {modules.map((line, row) => (
                  <View key={row} style={styles.qrRow}>
                    {line.map((dark, col) => (
                      <View
                        key={col}
                        style={{
                          width: QR_SIZE / modules.length,
                          height: QR_SIZE / modules.length,
                          backgroundColor: dark ? '#000' : '#fff',
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            : <View style={[styles.qrPlaceholder, { width: QR_SIZE, height: QR_SIZE }]}>
                <ActivityIndicator color={theme['c-primary-font']} />
              </View>
        }
        {
          status == 'expired'
            ? <TouchableOpacity style={styles.overlay} onPress={() => { void refreshQr() }} activeOpacity={0.8}>
                <Text size={13} color="#fff">{t('wy_login_qr_refresh')}</Text>
              </TouchableOpacity>
            : null
        }
      </View>
      <Text size={12} color={theme['c-font-label']} style={styles.tip}>{message}</Text>
      <Text size={11} color={theme['c-300']} style={styles.hint}>{t('wy_login_qr_hint')}</Text>
    </>
  )

  const renderPhone = () => (
    <View style={styles.form}>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder={t('wy_login_phone_placeholder')}
        placeholderTextColor={theme['c-350']}
        keyboardType="phone-pad"
        maxLength={15}
        style={[styles.input, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
      />
      {
        platform == 'wy'
          ? <>
              <View style={styles.modeRow}>
                {
                  ([['password', 'wy_login_mode_password'], ['captcha', 'wy_login_mode_captcha']] as const).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => { setMode(key) }}
                      activeOpacity={0.7}
                      style={[styles.modeChip, {
                        borderColor: mode == key ? theme['c-primary-font'] : theme['c-border-background'],
                      }]}
                    >
                      <Text size={12} color={mode == key ? theme['c-primary-font'] : theme['c-font-label']}>{t(label)}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>
              {
                mode == 'password'
                  ? <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t('wy_login_password_placeholder')}
                      placeholderTextColor={theme['c-350']}
                      secureTextEntry
                      style={[styles.input, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
                    />
                  : <View style={styles.codeRow}>
                      <TextInput
                        value={captcha}
                        onChangeText={setCaptcha}
                        placeholder={t('wy_login_captcha_placeholder')}
                        placeholderTextColor={theme['c-350']}
                        keyboardType="number-pad"
                        maxLength={8}
                        style={[styles.input, styles.codeInput, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
                      />
                      <TouchableOpacity
                        onPress={handleSendCode}
                        disabled={cooldown > 0}
                        activeOpacity={0.7}
                        style={[styles.codeBtn, {
                          borderColor: cooldown > 0 ? theme['c-border-background'] : theme['c-primary-font'],
                        }]}
                      >
                        <Text size={12} color={cooldown > 0 ? theme['c-font-label'] : theme['c-primary-font']}>
                          {cooldown > 0 ? t('wy_login_code_countdown', { s: cooldown }) : t('wy_login_send_code')}
                        </Text>
                      </TouchableOpacity>
                    </View>
              }
            </>
          : <View style={styles.codeRow}>
              <TextInput
                value={captcha}
                onChangeText={setCaptcha}
                placeholder={t('wy_login_captcha_placeholder')}
                placeholderTextColor={theme['c-350']}
                keyboardType="number-pad"
                maxLength={8}
                style={[styles.input, styles.codeInput, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
              />
              <TouchableOpacity
                onPress={handleSendCode}
                disabled={cooldown > 0}
                activeOpacity={0.7}
                style={[styles.codeBtn, {
                  borderColor: cooldown > 0 ? theme['c-border-background'] : theme['c-primary-font'],
                }]}
              >
                <Text size={12} color={cooldown > 0 ? theme['c-font-label'] : theme['c-primary-font']}>
                  {cooldown > 0 ? t('wy_login_code_countdown', { s: cooldown }) : t('wy_login_send_code')}
                </Text>
              </TouchableOpacity>
            </View>
      }
      <TouchableOpacity
        onPress={handlePhoneLogin}
        disabled={submitting}
        activeOpacity={0.8}
        style={[styles.submitBtn, { backgroundColor: theme['c-primary-background'] }]}
      >
        {submitting
          ? <ActivityIndicator color={theme['c-primary-font']} size="small" />
          : <Text size={14} color={theme['c-primary-font']}>{t('wy_login_submit')}</Text>}
      </TouchableOpacity>
      <Text size={11} color={theme['c-300']} style={styles.hint}>
        {platform == 'tx' ? t('qq_login_phone_hint') : t('wy_login_phone_hint')}
      </Text>
    </View>
  )

  const renderCookie = () => (
    <View style={styles.form}>
      <Text size={11} color={theme['c-font-label']} style={styles.hint}>{t('kg_login_cookie_hint')}</Text>
      <TextInput
        value={cookieInput}
        onChangeText={setCookieInput}
        placeholder="userid=xxx; token=xxx; mid=xxx"
        placeholderTextColor={theme['c-350']}
        multiline
        style={[styles.input, styles.cookieInput, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
      />
      <TouchableOpacity
        onPress={handleCookieLogin}
        disabled={submitting}
        activeOpacity={0.8}
        style={[styles.submitBtn, { backgroundColor: theme['c-primary-background'] }]}
      >
        {submitting
          ? <ActivityIndicator color={theme['c-primary-font']} size="small" />
          : <Text size={14} color={theme['c-primary-font']}>{t('wy_login_submit')}</Text>}
      </TouchableOpacity>
    </View>
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mask}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: theme['c-content-background'] }]}>
            <View style={styles.header}>
              <Text size={15}>{`${t('wy_login_title')} · ${title}`}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={16} color={theme['c-font-label']} />
              </TouchableOpacity>
            </View>

            {
              platform == 'wy'
                ? <View style={styles.tabs}>
                    {
                      ([['qr', 'wy_login_tab_qr'], ['phone', 'wy_login_tab_phone']] as const).map(([key, label]) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.tab, wyTab == key ? { borderBottomColor: theme['c-primary-font'] } : null]}
                          onPress={() => { setWyTab(key) }}
                          activeOpacity={0.7}
                        >
                          <Text size={13} color={wyTab == key ? theme['c-primary-font'] : theme['c-font-label']}>{t(label)}</Text>
                        </TouchableOpacity>
                      ))
                    }
                  </View>
                : null
            }

            {platform == 'kg' ? renderCookie() : (platform == 'wy' && wyTab == 'qr' ? renderQr() : renderPhone())}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
})

const styles = createStyle({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 40,
  },
  card: {
    width: 310,
    borderRadius: 16,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 8,
  },
  closeBtn: {
    position: 'absolute',
    right: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tab: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  qrBox: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  qrRow: {
    flexDirection: 'row',
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tip: {
    textAlign: 'center',
    paddingLeft: 20,
    paddingRight: 20,
  },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    lineHeight: 17,
  },
  form: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 10,
  },
  /** 不再写死 height：系统字体放大时固定高度会把文字裁掉一半 */
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    marginTop: 10,
    textAlignVertical: 'center',
  },
  cookieInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  modeRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeInput: {
    flexGrow: 1,
    flexShrink: 1,
  },
  codeBtn: {
    marginLeft: 8,
    marginTop: 10,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
