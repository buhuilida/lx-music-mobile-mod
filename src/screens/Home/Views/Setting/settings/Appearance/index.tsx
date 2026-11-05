import { memo } from 'react'

import Section from '../../components/Section'
import Theme from '../Theme'
import FontSize from '../Basic/FontSize'
import Language from '../Basic/Language'
import { useI18n } from '@/lang'

/**
 * 外观与主题：主题、字体、背景、语言。
 * 原来这些都混在「基本设置」里（16 项），和按钮显不显示那类开关挤在一起，
 * 找主题得往下翻半天。这里拆出来单独一类。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_appearance')}>
      <Theme />
      <FontSize />
      <Language />
    </Section>
  )
})
