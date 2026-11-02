import { memo, useEffect, useState } from 'react'
import { Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { HEADER_HEIGHT as _HEADER_HEIGHT, COMPONENT_IDS } from '@/config/constant'
import { setComponentId, updateSetting } from '@/core/common'
import { scaleSizeH } from '@/utils/pixelRatio'
import WyLoginModal from '@/components/WyLoginModal'
import { initNetease } from '@/core/netease'
import { isSaved, verifyAccount, type AccountSnapshot, type PlatformKey } from '@/core/accountStatus'
import { friendlyError } from '@/utils/errorMsg'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

interface PlatformItem {
  key: 'wy' | 'tx' | 'kg'
  name: string
  settingKey: 'platform.wyCookie' | 'platform.txCookie' | 'platform.kgCookie'
  /** 判断 Cookie 是否有效至少要包含其中一个标记 */
  marks: string[]
  color: string
}

const PLATFORMS: PlatformItem[] = [
  { key: 'wy', name: '网易云音乐', settingKey: 'platform.wyCookie', marks: ['MUSIC_U='], color: '#E5433E' },
  { key: 'tx', name: 'QQ 音乐', settingKey: 'platform.txCookie', marks: ['uin=', 'qqmusic_key='], color: '#31C27C' },
  { key: 'kg', name: '酷狗音乐', settingKey: 'platform.kgCookie', marks: ['kg_mid=', 'kg_music='], color: '#2C6BF3' },
]

/**
 * 平台设置（1.19.0）
 *
 * 保存各平台的登录 Cookie，用于读取私密歌单 / 云盘歌单。
 * Cookie 只存在本机设置里，不上传、不参与同步。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const wyCookie = useSettingValue('platform.wyCookie')
  const txCookie = useSettingValue('platform.txCookie')
  const kgCookie = useSettingValue('platform.kgCookie')
  const cookies = { 'platform.wyCookie': wyCookie, 'platform.txCookie': txCookie, 'platform.kgCookie': kgCookie }

  const [editing, setEditing] = useState<PlatformItem | null>(null)
  const [draft, setDraft] = useState('')
  const [qrVisible, setQrVisible] = useState(false)
  const [statuses, setStatuses] = useState<Record<PlatformKey, AccountSnapshot>>({
    wy: { status: 'off', name: '', avatar: '' },
    tx: { status: 'off', name: '', avatar: '' },
    kg: { status: 'off', name: '', avatar: '' },
  })

  // Cookie 一变就重新校验，避免「已登录却显示未登录」
  useEffect(() => {
    let alive = true
    PLATFORMS.forEach((item) => {
      if (!isSaved(item.key)) {
        if (alive) setStatuses(prev => ({ ...prev, [item.key]: { status: 'off', name: '', avatar: '' } }))
        return
      }
      if (alive) setStatuses(prev => ({ ...prev, [item.key]: { ...prev[item.key], status: 'checking' } }))
      void verifyAccount(item.key).then((snap) => {
        if (alive) setStatuses(prev => ({ ...prev, [item.key]: snap }))
      })
    })
    return () => { alive = false }
  }, [wyCookie, txCookie, kgCookie])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.platformSetting, componentId)
  }, [componentId])

  const openEdit = (item: PlatformItem) => {
    setDraft(cookies[item.settingKey] ?? '')
    setEditing(item)
  }

  const handleSave = () => {
    if (!editing) return
    const value = draft.trim()
    if (value && !editing.marks.some(mark => value.includes(mark))) {
      toast(t('platform_cookie_invalid', { mark: editing.marks[0] }), 'long')
      return
    }
    updateSetting({ [editing.settingKey]: value })
    toast(value ? t('platform_cookie_saved') : t('platform_cookie_cleared'))
    // 网易 Cookie 保存后立刻校验一次，昵称/关注歌手等状态同步刷新
    if (editing.key == 'wy' && value) {
      void initNetease(true).then(() => {
        toast(t('wy_login_success'))
      }).catch((err: Error) => {
        toast(friendlyError(err) || t('wy_login_failed'), 'long')
      })
    }
    setEditing(null)
  }

  const handleClear = () => {
    if (!editing) return
    updateSetting({ [editing.settingKey]: '' })
    toast(t('platform_cookie_cleared'))
    setEditing(null)
  }

  return (
    <PageContent>
      <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
        <StatusBar />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void pop(componentId) }} style={styles.headerBtn}>
            <Icon name="chevron-left" size={18} />
          </TouchableOpacity>
          <Text size={15} style={styles.headerTitle} numberOfLines={1}>{t('platform_title')}</Text>
          <View style={styles.headerBtn} />
        </View>
      </View>

      <ScrollView style={styles.body}>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('platform_tip')}</Text>
        {PLATFORMS.map((item) => {
          const saved = isSaved(item.key)
          const snap = statuses[item.key]
          // 只有校验通过才展示昵称；校验中 / 失效各自给一句明确提示
          let statusText = t('platform_status_off')
          if (saved) {
            if (snap.status === 'checking') statusText = t('platform_status_checking')
            else if (snap.status === 'expired') statusText = t('platform_status_expired')
            else if (snap.name) statusText = `${snap.name}${snap.vipType ? ' · VIP' : ''}`
            else statusText = t('platform_status_on')
          }
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.7}
              style={[styles.card, { backgroundColor: theme['c-content-background'] }]}
              onPress={() => { openEdit(item) }}
            >
              <View style={[styles.avatar, { backgroundColor: item.color }]}>
                <Text size={13} color="#fff">{item.key.toUpperCase()}</Text>
              </View>
              <View style={styles.cardContent}>
                <Text size={14}>{item.name}</Text>
                <Text size={11} color={theme['c-font-label']} style={styles.cardSub} numberOfLines={1}>
                  {statusText}
                </Text>
              </View>
              {item.key == 'wy'
                ? <TouchableOpacity
                    style={[styles.scanBtn, { borderColor: theme['c-border-background'] }]}
                    onPress={() => { setQrVisible(true) }}
                    activeOpacity={0.7}
                  >
                    <Text size={11} color={theme['c-primary-font']}>{t('wy_login_scan')}</Text>
                  </TouchableOpacity>
                : null}
              <View style={[styles.badge, { borderColor: saved ? item.color : theme['c-border-background'] }]}>
                <Text size={10} color={saved ? item.color : theme['c-font-label']}>CK</Text>
              </View>
              <Icon name="chevron-right" size={14} color={theme['c-350']} />
            </TouchableOpacity>
          )
        })}
        <Text size={11} color={theme['c-font-label']} style={styles.footTip}>{t('platform_foot_tip')}</Text>
      </ScrollView>

      <WyLoginModal
        visible={qrVisible}
        onClose={() => { setQrVisible(false) }}
        onSuccess={() => { void initNetease(true).catch(() => {}) }}
      />

      <Modal visible={editing != null} transparent animationType="fade" onRequestClose={() => { setEditing(null) }}>
        <View style={styles.modalMask}>
          <View style={[styles.modal, { backgroundColor: theme['c-content-background'] }]}>
            <Text size={15} style={styles.modalTitle}>{editing?.name} {t('platform_login')}</Text>
            <Text size={11} color={theme['c-font-label']} style={styles.modalTip}>{t('platform_cookie_tip')}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('platform_cookie_placeholder')}
              placeholderTextColor={theme['c-350']}
              multiline
              style={[styles.modalInput, { color: theme['c-font'], borderColor: theme['c-border-background'] }]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme['c-border-background'] }]} onPress={() => { setEditing(null) }}>
                <Text size={13} color={theme['c-font-label']}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme['c-border-background'] }]} onPress={handleClear}>
                <Text size={13} color={theme['c-font-label']}>{t('platform_logout')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme['c-primary-background'] }]}
                onPress={handleSave}
              >
                <Text size={13} color={theme['c-primary-font']}>{t('platform_cookie_save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </PageContent>
  )
})

const styles = createStyle({
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  },
  headerBtn: {
    width: 40,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
  },
  tip: {
    lineHeight: 17,
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 12,
    paddingRight: 12,
  },
  cardSub: {
    marginTop: 2,
  },
  scanBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
    paddingBottom: 4,
    marginRight: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 1,
    paddingBottom: 1,
    marginRight: 8,
  },
  footTip: {
    marginTop: 10,
    lineHeight: 17,
  },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingLeft: 22,
    paddingRight: 22,
  },
  modal: {
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  modalTip: {
    lineHeight: 16,
    marginBottom: 10,
  },
  modalInput: {
    minHeight: 96,
    maxHeight: 180,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  modalBtns: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  modalBtn: {
    flexGrow: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: {
    borderWidth: 0,
  },
})
