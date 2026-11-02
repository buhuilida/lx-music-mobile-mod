import { memo } from 'react'

import Section from '../../components/Section'
import FileNameStyle from './FileNameStyle'
import SaveLrcFile from './SaveLrcFile'
import DownloadPath from './DownloadPath'
import Concurrency from './Concurrency'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <Concurrency />
      <DownloadPath />
      <FileNameStyle />
      <SaveLrcFile />
    </Section>
  )
})
