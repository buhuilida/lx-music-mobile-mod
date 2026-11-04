import { memo } from 'react'
import { View, TouchableOpacity } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, openUrl } from '@/utils/tools'

/** 本仓库（应用内唯一的「官方」入口） */
export const MODIFIED_BY = 'buhuilida'
export const MOD_GITHUB_APP = 'https://github.com/buhuilida/lx-music-mobile-mod'

/** 上游项目：仅作书面致谢并保留出处链接 */
export const UPSTREAM_MOD = 'https://github.com/yzdz666/lx-music-mobile-mod'
export const UPSTREAM_ORIGIN = 'https://github.com/lyswhut/lx-music-mobile'

export const CREDIT_PROJECTS = [
  {
    name: 'lyswhut/lx-music-mobile',
    url: UPSTREAM_ORIGIN,
    desc: 'about_credit_lx',
  },
  {
    name: 'yzdz666/lx-music-mobile-mod',
    url: UPSTREAM_MOD,
    desc: 'about_credit_mod',
  },
] as const

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()

  const openApp = () => {
    void openUrl(MOD_GITHUB_APP)
  }
  const openCredit = (url: string) => {
    void openUrl(url)
  }

  return (
    <SubTitle title={t('setting_about')}>
      <View style={styles.content}>
        <Text size={13}>{t('about_fork_intro')}</Text>
        <TouchableOpacity style={styles.linkBtn} activeOpacity={0.6} onPress={openApp}>
          <Text size={13} color={theme['c-primary-font']}>{t('about_mod_github_app')}</Text>
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
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingBottom: 15,
  },
  linkBtn: {
    marginTop: 8,
  },
  creditTitle: {
    marginTop: 14,
    fontWeight: '600',
  },
})
