import { memo, useCallback, useRef, useState } from 'react'
import { ActivityIndicator, TouchableOpacity, View } from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import Input, { type InputType } from '@/components/common/Input'
import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import { setNavActiveId } from '@/core/common'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { loginWithCookie, loginWithCookieManager, useBaiduPanAuth } from '@/core/baiduPan/auth'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const PAN_HOME = 'https://pan.baidu.com/'
const LOGGED_IN_RXP = /pan\.baidu\.com\/(disk|wap)\/(home|main)/

/**
 * 百度网盘登录页
 *
 * 在 WebView 里正常登录，登录成功后从 Cookie 罐里取 BDUSS（HttpOnly，document.cookie 拿不到），
 * 再换 bdstoken 落库；同时提供「手动粘贴 Cookie」兜底（模拟器 / WebView 异常时用）。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const auth = useBaiduPanAuth()
  const cookieInputRef = useRef<InputType>(null)
  const [showCookiePanel, setShowCookiePanel] = useState(false)
  const [cookieText, setCookieText] = useState('')
  const [logging, setLogging] = useState(false)
  const handledRef = useRef(false)

  const back = () => { void pop(componentId) }

  const finishLogin = useCallback(() => {
    toast(t('baidu_pan_login_success'))
    back()
    // 登录完直接切到网盘视图，省得用户再点一次侧边栏
    setTimeout(() => { setNavActiveId('nav_baidu_pan') }, 350)
  }, [t])

  const handleNavigate = useCallback(async(navState: WebViewNavigation) => {
    if (handledRef.current || !LOGGED_IN_RXP.test(navState.url)) return
    handledRef.current = true
    setLogging(true)
    try {
      await loginWithCookieManager()
      finishLogin()
    } catch (err: any) {
      console.log('[百度网盘] 从 WebView 取 Cookie 登录失败:', err?.message ?? err)
      toast(t('baidu_pan_login_failed'), 'long')
      setTimeout(() => { handledRef.current = false }, 3000)
    } finally {
      setLogging(false)
    }
  }, [finishLogin, t])

  const handleCookieLogin = useCallback(async() => {
    const raw = cookieText.trim()
    if (!raw) {
      cookieInputRef.current?.focus()
      return
    }
    setLogging(true)
    try {
      await loginWithCookie(raw)
      finishLogin()
    } catch (err: any) {
      console.log('[百度网盘] 手动 Cookie 登录失败:', err?.message ?? err)
      toast(t('baidu_pan_cookie_invalid'), 'long')
    } finally {
      setLogging(false)
    }
  }, [cookieText, finishLogin, t])

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={back} style={styles.backBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <View style={styles.titleContent}>
            <Text numberOfLines={1} size={16}>{t('baidu_pan_login_title')}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowCookiePanel((visible) => !visible)
              if (!showCookiePanel) setTimeout(() => cookieInputRef.current?.focus(), 120)
            }}
            style={styles.rightBtn}
          >
            <Icon name={showCookiePanel ? 'close' : 'dots-vertical'} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {showCookiePanel
        ? (
          <View style={styles.cookiePanel}>
            <Text size={12} color={theme['c-font-label']} style={styles.cookieTip}>
              {t('setting_download_baidu_paste_cookie_tip')}
            </Text>
            <Input
              ref={cookieInputRef}
              value={cookieText}
              onChangeText={setCookieText}
              placeholder={t('baidu_pan_cookie_paste_placeholder')}
              multiline
              style={{ ...styles.cookieInput, color: theme['c-font'], borderColor: theme['c-400'] }}
              placeholderTextColor={theme['c-font-label']}
            />
            <TouchableOpacity
              onPress={() => { void handleCookieLogin() }}
              disabled={logging}
              style={{ ...styles.cookieBtn, backgroundColor: theme['c-primary'] }}
            >
              {logging
                ? <ActivityIndicator size="small" color={theme['c-primary-font']} />
                : <Text size={13} color={theme['c-primary-font']}>{t('setting_download_baidu_login')}</Text>}
            </TouchableOpacity>
          </View>
          )
        : (
          <WebView
            source={{ uri: PAN_HOME }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            onNavigationStateChange={(navState) => { void handleNavigate(navState) }}
            style={styles.webview}
          />
          )}

      {auth
        ? (
          <View style={[styles.loggedInBar, { backgroundColor: theme['c-primary-alpha-400'] }]}>
            <Text size={12} color={theme['c-primary-font']}>{t('baidu_pan_login_success')}</Text>
          </View>
          )
        : null}
    </PageContent>
  )
})

const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 10,
  },
  backBtn: {
    width: HEADER_HEIGHT,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  rightBtn: {
    padding: 10,
  },
  webview: {
    flex: 1,
  },
  cookiePanel: {
    flex: 1,
    padding: 15,
  },
  cookieTip: {
    marginBottom: 8,
  },
  cookieInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    textAlignVertical: 'top',
  },
  cookieBtn: {
    marginTop: 12,
    height: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedInBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    alignItems: 'center',
  },
})
