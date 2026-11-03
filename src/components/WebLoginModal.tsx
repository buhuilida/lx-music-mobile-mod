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
 * 内置官方网页登录
 *
 * WebView 打开官方登录页 → CookieManager 读 cookie → 命中登录标记就落库。
 *
 * 1.22.5 修两个会让「登录了却没生效」的问题：
 * 1. 原来按 URL 读 cookie，QQ 的凭证常常落在 .qq.com / ptlogin2 域，读不到就永远存不进去；
 *    现在按域读完再用 getAll() 兜底合并一次。
 * 2. 原来 doneRef 在 save 之前就置 true，一旦第一次读取时 cookie 还没写全，
 *    后续轮询全部被拦掉，等于永久失败；现在只有保存成功才置位，失败会把原因显示出来。
 */

type Platform = 'wy' | 'tx' | 'kg'

interface PlatformConfig {
  name: string
  /** 官方登录页 */
  url: string
  /** 需要读取 cookie 的域 */
  cookieUrls: string[]
  /** 只保留这些域下的 cookie（getAll 兜底时用） */
  cookieHosts: string[]
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
    cookieHosts: ['music.163.com', '163.com'],
    match: /(?:^|;\s*)MUSIC_U=/,
    save: async cookie => loginWithCookie(cookie),
  },
  tx: {
    name: 'QQ 音乐',
    url: 'https://y.qq.com/',
    // 登录可能先落在 ptlogin2 / graph.qq.com，再回写 y.qq.com，全部读一遍
    cookieUrls: [
      'https://y.qq.com',
      'https://u.y.qq.com',
      'https://c.y.qq.com',
      'https://i.y.qq.com',
      'https://graph.qq.com',
      'https://ptlogin2.qq.com',
    ],
    cookieHosts: ['qq.com'],
    // 与 tx/user.js 的 hasTxSession 保持一致：有播放密钥就算登录
    match: /(?:^|;\s*)(?:qm_keyst|qqmusic_key|musickey)=/,
    save: async cookie => loginQQWithCookie(cookie),
    desktop: true,
    autoClickLogin: true,
  },
  kg: {
    name: '酷狗音乐',
    url: 'https://www.kugou.com/',
    cookieUrls: ['https://www.kugou.com', 'https://m.kugou.com', 'https://login.kugou.com', 'https://m3ws.kugou.com'],
    cookieHosts: ['kugou.com'],
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
  const [savingError, setSavingError] = useState('')
  const [cookieCount, setCookieCount] = useState(0)
  const webRef = useRef<WebView>(null)
  const busyRef = useRef(false)
  const doneRef = useRef(false)
  const aliveRef = useRef(true)

  /** 把一个 jar（可能是 {name: Cookie} 或 Cookie[]）合并进 map */
  const mergeJar = (jar: unknown, merged: Map<string, string>) => {
    if (!jar) return
    const items = Array.isArray(jar) ? jar : Object.values(jar as Record<string, unknown>)
    items.forEach((item) => {
      const cookie = item as { name?: string, value?: string }
      if (cookie?.name && cookie.value != null) merged.set(cookie.name, cookie.value)
    })
  }

  /** 读当前 WebView 里该平台的 cookie，拼成 `k=v; k2=v2` */
  const readCookie = useCallback(async() => {
    const merged = new Map<string, string>()
    for (const url of cfg.cookieUrls) {
      try {
        mergeJar(await CookieManager.get(url), merged)
      } catch (err) {
        // 某个子域读不到不影响其它域
      }
    }
    // 兜底：按域全量读一次。QQ / 酷狗的凭证经常落在父域上，按 URL 读会漏。
    try {
      const all = await CookieManager.getAll() as Record<string, unknown>
      Object.entries(all ?? {}).forEach(([domain, jar]) => {
        if (!cfg.cookieHosts.some(host => domain.includes(host))) return
        mergeJar(jar, merged)
      })
    } catch (err) {
      // getAll 在部分 ROM 上会拒绝，忽略
    }
    return {
      cookie: [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
      count: merged.size,
    }
  }, [cfg])

  /** 检测并落库；返回是否已成功 */
  const checkAndSave = useCallback(async(manual = false): Promise<boolean> => {
    if (busyRef.current) return false
    if (doneRef.current && !manual) return false
    busyRef.current = true
    setChecking(true)
    try {
      const { cookie, count } = await readCookie()
      setCookieCount(count)
      if (!cookie) {
        setSavingError(t('web_login_no_cookie'))
        return false
      }
      if (!cfg.match.test(cookie)) {
        setSavingError(t('web_login_no_ticket'))
        return false
      }
      // 先保存，成功了才锁定，避免「第一次没读全 → 之后永远不再试」
      await cfg.save(cookie)
      doneRef.current = true
      setSavingError('')
      if (!aliveRef.current) return true
      toast(t('wy_login_success'))
      onSuccess?.()
      onClose()
      return true
    } catch (err) {
      // cookie 有了但服务端不认：把原因留在界面上，方便判断是没登录还是没读全
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`ACCOUNT web_login_save_failed platform=${platform} reason=` + msg)
      setSavingError(msg)
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
    setSavingError('')
    setCookieCount(0)
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
    setSavingError('')
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
          <View style={styles.footerText}>
            <Text size={11} color={theme['c-font-label']} numberOfLines={2}>
              {cfg.desktop ? t('web_login_desktop_tip') : t('web_login_tip')}
            </Text>
            {savingError
              ? <Text size={10} color={theme['c-primary-font']} numberOfLines={2} style={styles.footerErr}>
                  {savingError}（已读到 {cookieCount} 条）
                </Text>
              : null}
          </View>
          <TouchableOpacity
            style={[styles.checkBtn, { borderColor: theme['c-primary-font'] }]}
            activeOpacity={0.7}
            onPress={() => { void checkAndSave(true) }}
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
  footerText: {
    flexGrow: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  footerErr: {
    marginTop: 4,
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
