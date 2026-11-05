import { memo } from 'react'

import Section from '../../components/Section'
import ScanLocalMusic from '../Other/ScanLocalMusic'
import DislikeList from '../Other/DislikeList'
import ShareType from '../Basic/ShareType'
import IsUseSystemFileSelector from '../Basic/IsUseSystemFileSelector'
import { useI18n } from '@/lang'

/**
 * 其他：本地音乐扫描、不喜欢的歌曲规则、分享方式、系统文件选择器。
 * 原来的「其他」里还塞着缓存、日志、下载管理、一起听、关于，现在各归各家，
 * 剩下的才是真·杂项。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_misc')}>
      <ScanLocalMusic />
      <DislikeList />
      <ShareType />
      <IsUseSystemFileSelector />
    </Section>
  )
})
