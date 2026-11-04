import { memo } from 'react'

import Section from '../../components/Section'
import FileNameStyle from './FileNameStyle'
import MetadataOptions from './MetadataOptions'
import DownloadPath from './DownloadPath'
import Concurrency from './Concurrency'
import Quality from './Quality'
import SaveTarget from './SaveTarget'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <Concurrency />
      <DownloadPath />
      <Quality />
      <FileNameStyle />
      <MetadataOptions />
      <SaveTarget />
    </Section>
  )
})
