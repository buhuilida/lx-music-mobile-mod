import { memo } from 'react'
import { View, TouchableOpacity } from 'react-native'

import Section from '../components/Section'

import { createStyle, openUrl } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { showPactModal } from '@/core/common'

/**
 * 应用内的「官方地址」只指向本仓库。
 * 上游只作书面致谢，不再挂下载站/赞助码——那是上游作者的东西，
 * 装到这个包里的用户点进去会误以为是我们发的。
 */
export const ABOUT_REPO_URL = 'https://github.com/buhuilida/lx-music-mobile-mod'
export const UPSTREAM_MOD_URL = 'https://github.com/yzdz666/lx-music-mobile-mod'
export const UPSTREAM_ORIGIN_URL = 'https://github.com/lyswhut/lx-music-mobile'

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()

  const openRepo = () => {
    void openUrl(ABOUT_REPO_URL)
  }
  const openUpstreamMod = () => {
    void openUrl(UPSTREAM_MOD_URL)
  }
  const openUpstreamOrigin = () => {
    void openUrl(UPSTREAM_ORIGIN_URL)
  }
  const openPact = () => {
    showPactModal()
  }

  const linkStyle = {
    ...styles.text,
    textDecorationLine: 'underline',
    color: theme['c-primary-font'],
  } as const

  return (
    <Section title={t('setting_about')}>
      <View style={styles.part}>
        <Text style={styles.text}>{t('about_fork_intro')}</Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.text}>{t('about_repo_title')}</Text>
        <TouchableOpacity activeOpacity={0.6} onPress={openRepo}>
          <Text style={linkStyle}>{ABOUT_REPO_URL}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.part}>
        <Text style={styles.sectionTitle}>{t('about_upstream_title')}</Text>
      </View>
      <View style={styles.part}>
        <TouchableOpacity activeOpacity={0.6} onPress={openUpstreamOrigin}>
          <Text style={linkStyle}>{t('about_upstream_lx')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.part}>
        <TouchableOpacity activeOpacity={0.6} onPress={openUpstreamMod}>
          <Text style={linkStyle}>{t('about_upstream_mod')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.part}>
        <Text style={styles.text}>{t('about_upstream_tip')}</Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.sectionTitle}>{t('about_notice_title')}</Text>
      </View>
      <View style={styles.part}>
        <Text style={styles.text}>{t('about_notice_scope')}</Text>
      </View>
      <View style={styles.part}>
        <Text style={styles.text}>{t('about_notice_free')}</Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.text}>{t('about_pact_prefix')}</Text>
        <TouchableOpacity activeOpacity={0.6} onPress={openPact}>
          <Text style={styles.text} color={theme['c-primary-font']}>{t('about_pact_name')}</Text>
        </TouchableOpacity>
        <Text style={styles.text}>{t('about_pact_suffix')}</Text>
      </View>
    </Section>
  )
})

const styles = createStyle({
  part: {
    marginLeft: 15,
    marginRight: 15,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  text: {
    fontSize: 14,
    textAlignVertical: 'bottom',
    lineHeight: 21,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
  },
})
