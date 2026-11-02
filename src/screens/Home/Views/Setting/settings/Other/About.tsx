import { memo, useRef, useEffect } from 'react'
import { View, TouchableOpacity, Image } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Text from '@/components/common/Text'
import Modal, { type ModalType } from '@/components/common/Modal'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useWindowSize } from '@/utils/hooks'
import { createStyle, openUrl } from '@/utils/tools'

export const MODIFIED_BY = '月下独酌'
export const MODIFIED_BY_QQ = '3139606844'

/** 二改版主页：APK 下载 / 源码下载 / 自建一起听教程（分享网关要求带 sharecode） */
export const MOD_HOME_URL = 'https://af384ee6deb6e09e2.app.workbuddy.host/download.html?sharecode=MKPWEVLBUS'

/** 二改源码仓库（App 端与一起听服务端/网页端） */
export const MOD_GITHUB_APP = 'https://github.com/yzdz666/lx-music-mobile-mod'
export const MOD_GITHUB_SERVER = 'https://github.com/yzdz666/listen-together-server'

/** 引用/致谢项目（1.15.0 起在关于页列出功能来源） */
export const CREDIT_PROJECTS = [
  {
    name: 'lyswhut/lx-music-mobile',
    url: 'https://github.com/lyswhut/lx-music-mobile',
    desc: 'about_credit_lx',
  },
  {
    name: 'WalnutBai/lx-lxwalnut-music-mobile',
    url: 'https://github.com/WalnutBai/lx-lxwalnut-music-mobile',
    desc: 'about_credit_lxx',
  },
] as const

const sponsorImage = require('@/resources/images/sponsor.png') // eslint-disable-line @typescript-eslint/no-var-requires

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const windowSize = useWindowSize()
  const sponsorModalRef = useRef<ModalType>(null)
  // 赞助码按屏幕较小的一边自适应，居中显示，避免弹窗里被裁剪
  const sponsorSize = Math.max(160, Math.min(windowSize.width - 104, windowSize.height * 0.54))

  const openModHome = () => {
    void openUrl(MOD_HOME_URL)
  }
  const openGithubApp = () => {
    void openUrl(MOD_GITHUB_APP)
  }
  const openGithubServer = () => {
    void openUrl(MOD_GITHUB_SERVER)
  }
  const openCredit = (url: string) => {
    void openUrl(url)
  }
  const showSponsor = () => {
    sponsorModalRef.current?.setVisible(true)
  }

  useEffect(() => {
    const modal = sponsorModalRef.current
    return () => { modal?.setVisible(false) }
  }, [])

  return (
    <SubTitle title={t('setting_about')}>
      <View style={styles.content}>
        <Text size={13}>{t('about_modified_by', { name: MODIFIED_BY })}</Text>
        <Text size={13} color={theme['c-font-label']} style={styles.item}>
          {t('about_contact_qq', { qq: MODIFIED_BY_QQ })}
        </Text>
        <TouchableOpacity style={styles.linkBtn} activeOpacity={0.6} onPress={openModHome}>
          <Text size={13} color={theme['c-primary-font']}>{t('about_mod_home')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} activeOpacity={0.6} onPress={openGithubApp}>
          <Text size={13} color={theme['c-primary-font']}>{t('about_mod_github_app')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} activeOpacity={0.6} onPress={openGithubServer}>
          <Text size={13} color={theme['c-primary-font']}>{t('about_mod_github_server')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} activeOpacity={0.6} onPress={showSponsor}>
          <Text size={13} color={theme['c-primary-font']}>{t('about_sponsor')}</Text>
        </TouchableOpacity>

        <Text size={13} style={styles.creditTitle}>{t('about_credit_title')}</Text>
        {
          CREDIT_PROJECTS.map(item => (
            <TouchableOpacity key={item.url} style={styles.linkBtn} activeOpacity={0.6} onPress={() => { openCredit(item.url) }}>
              <Text size={13} color={theme['c-primary-font']}>{item.name}</Text>
              <Text size={11} color={theme['c-font-label']}>{t(item.desc)}</Text>
            </TouchableOpacity>
          ))
        }
      </View>

      <Modal ref={sponsorModalRef} keyHide bgHide statusBarPadding bgColor="rgba(0,0,0,0.55)">
        <View style={styles.sponsorMask}>
          {/* 卡片自身吃掉点击，避免点图片时被 Modal 背景关闭 */}
          <TouchableOpacity
            activeOpacity={1}
            style={{ ...styles.sponsorCard, backgroundColor: theme['c-main-background'] }}
            onPress={() => {}}
          >
            <Text size={15} style={styles.sponsorTitle}>{t('about_sponsor_thanks')}</Text>
            <Image
              source={sponsorImage}
              style={{ ...styles.sponsorImage, width: sponsorSize, height: sponsorSize }}
              resizeMode="contain"
            />
            <TouchableOpacity style={styles.sponsorClose} activeOpacity={0.7} onPress={() => sponsorModalRef.current?.setVisible(false)}>
              <Text size={14} color={theme['c-primary-font']}>{t('about_sponsor_close')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </Modal>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingBottom: 15,
  },
  item: {
    marginTop: 6,
  },
  linkBtn: {
    marginTop: 8,
  },
  creditTitle: {
    marginTop: 14,
    fontWeight: '600',
  },
  sponsorMask: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sponsorCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingTop: 18,
    paddingBottom: 6,
    paddingHorizontal: 12,
    // 阴影让卡片在深色遮罩上更有层次
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sponsorTitle: {
    marginBottom: 12,
  },
  sponsorImage: {
    borderRadius: 12,
  },
  sponsorClose: {
    alignSelf: 'center',
    paddingHorizontal: 30,
    paddingVertical: 10,
    marginTop: 2,
  },
})
