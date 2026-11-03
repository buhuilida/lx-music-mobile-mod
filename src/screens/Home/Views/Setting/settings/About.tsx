import { memo } from 'react'
import { View, TouchableOpacity, Image } from 'react-native'

import Section from '../components/Section'

import { createStyle, openUrl } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useWindowSize } from '@/utils/hooks'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { showPactModal } from '@/core/common'

/** 二改仓库：关于页只保留这一个官方地址 */
export const ABOUT_REPO_URL = 'https://github.com/yzdz666/lx-music-mobile-mod'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sponsorImage = require('@/resources/images/sponsor.png') as number

/**
 * 关于
 *
 * 版式对齐 LX-X Music 的「应用信息」：说明 + 官方地址 + 赞助说明 + 赞助码 + 注意事项。
 * 赞助码直接内嵌在页面里（不再是弹窗），宽度按屏幕自适应并限制上限，
 * 保证整张图完整可见、不被裁切，也不用点开才能看到。
 */
export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const windowSize = useWindowSize()

  // 正方形二维码：留出左右边距，再限制一个上限，大屏也不会拉得过大
  const sponsorSize = Math.min(Math.max(180, windowSize.width - 96), 288)

  const openRepo = () => {
    void openUrl(ABOUT_REPO_URL)
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
        <Text style={styles.text}>{t('about_free_tip')}</Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.text}>{t('about_repo_title')}</Text>
        <TouchableOpacity activeOpacity={0.6} onPress={openRepo}>
          <Text style={linkStyle}>{ABOUT_REPO_URL}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.part}>
        <Text style={styles.text}>{t('about_sponsor_invite')}</Text>
      </View>
      <View style={styles.part}>
        <Text style={styles.text}>{t('about_sponsor_greet')}</Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.sectionTitle}>{t('about_sponsor_section')}</Text>
      </View>
      <View style={styles.sponsorWrap}>
        <View style={[styles.sponsorCard, { borderColor: theme['c-border-background'] }]}>
          <Image
            source={sponsorImage}
            style={{ width: sponsorSize, height: sponsorSize, borderRadius: 8 }}
            resizeMode="contain"
          />
        </View>
        <Text size={12} color={theme['c-font-label']} style={styles.sponsorCaption}>
          {t('about_sponsor_caption')}
        </Text>
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
  sponsorWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  sponsorCard: {
    // 赞助码本身是白底图，卡片固定白底 + 细边框，深浅主题下都不会脏
    backgroundColor: '#fff',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  sponsorCaption: {
    marginTop: 8,
  },
})
