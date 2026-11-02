import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native'
import { WebView } from 'react-native-webview'
import CookieManager from '@react-native-cookies/cookies'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { loginWithCookie } from '@/core/netease'
import { loginQQWithCookie } from '@/core/qq'
import { loginKgWithCookie } from '@/core/kugou'

/**
 * 内置官方网页登录（1.22.3）
 *
 * 来自 Walnut v26.09.28 反编译：
 *   WebView 打开官方登录页 → CookieManager.get(url) 读 cookie →
 *   命中登录标记就落库。
 *   依赖：react-native-webview + @react-native-cookies/cookies
 *
 * 相比自己拼手机号 / 验证码接口，这条路走的是官方页面，
 * 滑块验证、异地登录二次验证都由官方页面自己处理，成功率最高。
 */

type Platform = 'wy' | 'tx' | 'kg'

interface PlatformConfig {
  name: string
  /** 官方登录页 */
  url: string
  /** 需要读取 cookie 的域（合并去重，qq 的 cookie 分散在多个子域） */
  cookieUrls: string[]
  /** 命中即视为登录成功的 cookie */
  match: RegExp
  /** 登录成功后写入设置的函数 */
  save: (cookie: string) => Promise<unknown>
  /** 用桌面 UA 打开（QQ/酷狗没有可用的移动版登录页，登录入口只在桌面版） */
  desktop?: boolean
  /** 进页面自动点一次「登录」按钮，省得用户自己找 */
  autoClickLogin?: boolean
}

const CONFIG: Record<Platform, PlatformConfig> = {
  wy: {
    name: '网易云音乐',
    url: 'https://music.163.com/m/login',
    cookieUrls: ['https://music.163.com'],
    match: /(?:^|;\s*)MUSIC_U=/,
    save: async cookie => loginWithCookie(cookie),
  },
  tx: {
    name: 'QQ 音乐',
    url: 'https://y.qq.com/',
    cookieUrls: ['https://y.qq.com', 'https://u.y.qq.com', 'https://c.y.qq.com'],
    match: /(?:^|;\s*)(?:qm_keyst|qqmusic_key|musickey)=/,
    save: async cookie => loginQQWithCookie(cookie),
    // y.qq.com 的移动版只有「下载 App」，登录入口在桌面版的右上角
    desktop: true,
    autoClickLogin: true,
  },
  kg: {
    name: '酷狗音乐',
    url: 'https://www.kugou.com/',
    cookieUrls: ['https://www.kugou.com', 'https://m.kugou.com'],
    // 注意：kg_mid 是游客也有的设备号，不能作为登录标记；
    // 只有 KuGoo（uid+token）和 kg_music 才是登录票据
    match: /(?:^|;\s*)(?:KuGoo|kg_music)=/,
    save: async cookie => loginKgWithCookie(cookie),
    desktop: true,
    autoClickLogin: true,
  },
}

const POLL_INTERVAL = 2500

/**
 * 自动点一次页面右上角的「登录」。
 * QQ 音乐 / 酷狗的桌面首页登录入口在导航栏，不点一下不会出登录框。
 */
const AUTO_CLICK_LOGIN = `
(function() {
  var tries = 0;
  var timer = setInterval(function() {
    tries++;
    if (tries > 16) { clearInterval(timer); return; }
    var nodes = document.querySelectorAll('a,span,div,button');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children.length) continue;
      if ((n.textContent || '').trim() !== '登录') continue;
      var r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // 只点顶部导航区的，避免点到正文里的「登录」
      if (r.top > 160) continue;
      n.click();
      clearInterval(timer);
      return;
    }
  }, 600);
})();
`

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 网易云登录页的「同意协议」复选框点不动 —— 页面用 touchmove 拦截了冒泡。
 * 这段补丁来自 Walnut 反编译，只对 wy 生效。
 */
const WY_TOUCH_PATCH = `
(function() {
  if (window.__lxNeteaseLoginTouchPatch) return true;
  window.__lxNeteaseLoginTouchPatch = true;
  var originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    var isCapture = options === true || !!(options && options.capture);
    var isBodyTouchMove = type === 'touchmove' && isCapture && (this === document || this === document.body);
    if (isBodyTouchMove && typeof listener === 'function') {
      var wrappedListener = function(event) {
        var yidun = document.querySelector('.yidun');
        if (yidun && !yidun.contains(event.target)) return;
        return listener.call(this, event);
      };
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  var touchStartX = 0;
  var touchStartY = 0;
  document.addEventListener('touchstart', function(event) {
    if (!event.touches || event.touches.length !== 1) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, true);
  document.addEventListener('touchend', function(event) {
    if (!event.changedTouches || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    if (Math.abs(touch.clientX - touchStartX) > 8 || Math.abs(touch.clientY - touchStartY) > 8) return;
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('a[href*="official-terms"]')) return;
    var clickable = target.closest('span,label');
    if (!clickable) return;
    var terms = clickable.parentElement;
    if (!terms || !terms.textContent || terms.textContent.indexOf('同意') === -1 ||
        !terms.querySelector('a[href*="official-terms"]')) return;
    event.preventDefault();
    event.stopPropagation();
    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, true);
  return true;
})();
`

interface Props {
  visible: boolean
  platform: Platform
  onClose: () => void
  onSuccess?: () => void
}

export default memo(({ visible, platform, onClose, onSuccess }: Props) => {
  const t = useI18n()
  const theme = useTheme()
  const cfg = CONFIG[platform]

  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState('')
  const webRef = useRef<WebView>(null)
  const busyRef = useRef(false)
  const doneRef = useRef(false)
  const aliveRef = useRef(true)

  /** 读当前 WebView 里该平台的 cookie，拼成 `k=v; k2=v2` */
  const readCookie = useCallback(async() => {
    const merged = new Map<string, string>()
    for (const url of cfg.cookieUrls) {
      try {
        const jar = await CookieManager.get(url) as Record<string, { name?: string, value?: string }>
        Object.values(jar ?? {}).forEach((item) => {
          if (item?.name && item.value != null) merged.set(item.name, item.value)
        })
      } catch (err) {
        // 某个子域读不到不影响其它域
      }
    }
    return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }, [cfg])

  /** 检测并落库；返回是否已成功 */
  const checkAndSave = useCallback(async(): Promise<boolean> => {
    if (busyRef.current || doneRef.current) return false
    busyRef.current = true
    setChecking(true)
    try {
      const cookie = await readCookie()
      if (!cookie || !cfg.match.test(cookie)) return false
      doneRef.current = true
      await cfg.save(cookie)
      if (!aliveRef.current) return true
      toast(t('wy_login_success'))
      onSuccess?.()
      onClose()
      return true
    } catch (err) {
      // cookie 有了但校验不过：多半是刚登录、服务端还没生效，继续轮询
      console.log(`ACCOUNT web_login_save_failed platform=${platform} reason=` + (err instanceof Error ? err.message : String(err)))
      return false
    } finally {
      busyRef.current = false
      if (aliveRef.current) setChecking(false)
    }
  }, [cfg, onClose, onSuccess, platform, readCookie, t])

  // 打开时重置状态；关闭时停掉一切
  useEffect(() => {
    if (!visible) return
    aliveRef.current = true
    doneRef.current = false
    busyRef.current = false
    setLoading(true)
    setFailed('')
    return () => {
      aliveRef.current = false
    }
  }, [visible, platform])

  // 轮询：SPA 登录后 URL 常常不变，单靠导航事件抓不到
  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => { void checkAndSave() }, POLL_INTERVAL)
    return () => { clearInterval(timer) }
  }, [visible, checkAndSave])

  const handleNavChange = useCallback(() => { void checkAndSave() }, [checkAndSave])
  const handleLoadEnd = useCallback(() => {
    setLoading(false)
    void checkAndSave()
  }, [checkAndSave])

  const reload = useCallback(() => {
    setFailed('')
    setLoading(true)
    webRef.current?.reload()
  }, [])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme['c-content-background'] }]}>
        <View style={[styles.header, { borderBottomColor: theme['c-border-background'] }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} activeOpacity={0.7}>
            <Icon name="close" size={18} color={theme['c-font']} />
          </TouchableOpacity>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>{cfg.name}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={reload} activeOpacity={0.7}>
            <Text size={12} color={theme['c-font']}>{t('web_login_reload')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.webWrap}>
          <WebView
            ref={webRef}
            source={{ uri: cfg.url }}
            // 网易云用移动 UA 拿手机版登录页；QQ/酷狗没有移动版登录入口，只能桌面版
            userAgent={cfg.desktop ? DESKTOP_UA : MOBILE_UA}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            cacheEnabled={false}
            incognito={false}
            nestedScrollEnabled
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            onLoadStart={() => { setLoading(true) }}
            onLoadEnd={handleLoadEnd}
            onNavigationStateChange={handleNavChange}
            {...{ injectedJavaScriptBeforeContentLoaded: platform == 'wy' ? WY_TOUCH_PATCH : cfg.autoClickLogin ? AUTO_CLICK_LOGIN : undefined }}
            onError={(e) => {
              setLoading(false)
              setFailed(e.nativeEvent?.description ?? '')
            }}
            onHttpError={(e) => {
              setLoading(false)
              setFailed(`HTTP ${e.nativeEvent?.statusCode ?? ''}`)
            }}
            style={styles.web}
          />
          {loading
            ? <View style={styles.loadingMask} pointerEvents="none">
                <ActivityIndicator color={theme['c-primary-font']} />
              </View>
            : null}
        </View>

        <View style={[styles.footer, { borderTopColor: theme['c-border-background'] }]}>
          <Text size={11} color={theme['c-font-label']} style={styles.footerTip} numberOfLines={2}>
            {cfg.desktop ? t('web_login_desktop_tip') : t('web_login_tip')}
          </Text>
          <TouchableOpacity
            style={[styles.checkBtn, { borderColor: theme['c-primary-font'] }]}
            activeOpacity={0.7}
            onPress={() => { void checkAndSave() }}
          >
            <Text size={12} color={theme['c-primary-font']}>
              {checking ? t('web_login_checking') : t('web_login_check')}
            </Text>
          </TouchableOpacity>
        </View>

        {failed
          ? <View style={styles.errorBar}>
              <Text size={11} color="#fff" numberOfLines={2}>{t('web_login_failed')} {failed}</Text>
            </View>
          : null}
      </View>
    </Modal>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingLeft: 4,
    paddingRight: 4,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  webWrap: {
    flex: 1,
  },
  web: {
    flex: 1,
  },
  loadingMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  footerTip: {
    flexGrow: 1,
    flexShrink: 1,
    lineHeight: 16,
    marginRight: 8,
  },
  checkBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  errorBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 64,
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
})
