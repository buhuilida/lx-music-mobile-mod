import { memo } from 'react'

import Section from '../../components/Section'
import FileNameStyle from './FileNameStyle'
import MetadataOptions from './MetadataOptions'
import DownloadPath from './DownloadPath'
import Concurrency from './Concurrency'
import Quality from './Quality'
import SaveTarget from './SaveTarget'
import DownloadManager from '../Other/DownloadManager'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <SaveTarget />
      <DownloadPath />
      <Quality />
      <Concurrency />
      <FileNameStyle />
      <MetadataOptions />
      <DownloadManager />
    </Section>
  )
})
