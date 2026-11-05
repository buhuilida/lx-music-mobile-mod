import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import Source from '../Basic/Source'
import SourceName from '../Basic/SourceName'
import SourceTest from '../Player/SourceTest'
import IsShowHistorySearch from '../Search/IsShowHistorySearch'
import IsShowHotSearch from '../Search/IsShowHotSearch'
import { useI18n } from '@/lang'

/**
 * 音源与搜索：自定义源、来源显示名、音源实测，以及搜索页的历史/热门。
 * 「搜索设置」原来只有两项却占一个大类，现在并到这里。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_source_search')}>
      <SubTitle title={t('setting_source_group')}>
        <Source />
        <SourceName />
        <SourceTest />
      </SubTitle>
      <SubTitle title={t('setting_search')}>
        <IsShowHistorySearch />
        <IsShowHotSearch />
      </SubTitle>
    </Section>
  )
})
