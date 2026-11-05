import { memo } from 'react'

import Section from '../../components/Section'
import Sync from '../Sync'
import Backup from '../Backup'
import ResourceCache from '../Other/ResourceCache'
import MetaCache from '../Other/MetaCache'
import Log from '../Other/Log'
import { useI18n } from '@/lang'

/**
 * 数据与备份：一起听同步、WebDAV、本地备份、缓存与日志。
 * 原来这些分散在「数据同步」「备份与恢复」「其他」三个大类里。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <>
      <Sync />
      <Backup />
      <Section title={t('setting_cache_log')}>
        <ResourceCache />
        <MetaCache />
        <Log />
      </Section>
    </>
  )
})
