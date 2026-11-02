import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native'
import qrcode from 'qrcode-generator'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import wyUser from '@/utils/musicSdk/wy/user'
import { loginWithQrCookie } from '@/core/netease'

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
}

const QR_SIZE = 200
const POLL_INTERVAL = 2000

/**
 * 网易云二维码登录
 *
 * 之前平台设置只能让用户自己去浏览器抠 Cookie，绝大多数人根本拿不到。
 * 这里直接用网易的二维码登录接口：生成二维码 → 手机网易云扫码 → 轮询拿到
 * Cookie 写入设置，全程不用离开 App。
 */
export default memo(({ visible, onClose, onSuccess }: Props) => {
  const t = useI18n()
  const theme = useTheme()
  const [modules, setModules] = useState<boolean[][]>([])
  const [status, setStatus] = useState<'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const buildQr = useCallback((key: string) => {
    const qr = qrcode(0, 'M')
    qr.addData(`https://music.163.com/login?codekey=${key}`)
    qr.make()
    const count = qr.getModuleCount()
    const grid: boolean[][] = []
    for (let row = 0; row < count; row++) {
      const line: boolean[] = []
      for (let col = 0; col < count; col++) line.push(qr.isDark(row, col))
      grid.push(line)
    }
    setModules(grid)
  }, [])

  const startPolling = useCallback((key: string) => {
    stopPolling()
    timerRef.current = setInterval(() => {
      void wyUser.checkQrLogin(key).then(async(raw: unknown) => {
        const result = raw as { code: number, cookie?: string, message?: string }
        if (!aliveRef.current || keyRef.current != key) return
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
      }).catch(() => {})
    }, POLL_INTERVAL)
  }, [onClose, onSuccess, stopPolling, t])

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

  useEffect(() => {
    aliveRef.current = true
    if (visible) void refreshQr()
    return () => {
      aliveRef.current = false
      stopPolling()
    }
  }, [visible, refreshQr, stopPolling])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={[styles.card, { backgroundColor: theme['c-content-background'] }]}>
          <View style={styles.header}>
            <Text size={15}>{t('wy_login_title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="chevron-left" size={17} color={theme['c-font-label']} />
            </TouchableOpacity>
          </View>

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
        </View>
      </View>
    </Modal>
  )
})

const styles = createStyle({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 286,
    borderRadius: 16,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBox: {
    alignSelf: 'center',
    marginTop: 6,
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
    marginTop: 6,
    textAlign: 'center',
    paddingLeft: 24,
    paddingRight: 24,
    lineHeight: 16,
  },
})
