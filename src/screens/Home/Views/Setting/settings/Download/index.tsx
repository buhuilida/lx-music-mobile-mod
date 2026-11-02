import { memo } from 'react'

import Section from '../../components/Section'
import FileNameStyle from './FileNameStyle'
import SaveLrcFile from './SaveLrcFile'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <FileNameStyle />
      <SaveLrcFile />
    </Section>
  )
})
