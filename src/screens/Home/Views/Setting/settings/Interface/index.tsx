import { memo } from 'react'

import Section from '../../components/Section'
import NavMenus from '../Basic/NavMenus'
import DrawerLayoutPosition from '../Basic/DrawerLayoutPosition'
import IsHomePageScroll from '../Basic/IsHomePageScroll'
import IsShowBackBtn from '../Basic/IsShowBackBtn'
import IsShowExitBtn from '../Basic/IsShowExitBtn'
import IsAutoHidePlayBar from '../Basic/IsAutoHidePlayBar'
import IsAllowProgressBarSeek from '../Basic/IsAllowProgressBarSeek'
import IsAlwaysKeepStatusbarHeight from '../Basic/IsAlwaysKeepStatusbarHeight'
import IsClickPlayList from '../List/IsClickPlayList'
import IsShowAlbumName from '../List/IsShowAlbumName'
import IsShowInterval from '../List/IsShowInterval'
import AddMusicLocationType from '../List/AddMusicLocationType'
import IsStartupAutoPlay from '../Basic/IsStartupAutoPlay'
import IsStartupPushPlayDetailScreen from '../Basic/IsStartupPushPlayDetailScreen'
import { useI18n } from '@/lang'

/**
 * 界面与操作：侧边栏、抽屉、按钮显隐、列表显示方式、启动行为。
 *
 * 这些改的是「软件长什么样、点了会怎样」，跟主题配色无关，所以从外观里拆开。
 * 原来单独的「列表设置」只有 4 项却占一个大类，并到这里。
 */
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_interface')}>
      <NavMenus />
      <DrawerLayoutPosition />
      <IsHomePageScroll />
      <IsShowBackBtn />
      <IsShowExitBtn />
      <IsAutoHidePlayBar />
      <IsAllowProgressBarSeek />
      <IsAlwaysKeepStatusbarHeight />
      <IsClickPlayList />
      <IsShowAlbumName />
      <IsShowInterval />
      <AddMusicLocationType />
      <IsStartupAutoPlay />
      <IsStartupPushPlayDetailScreen />
    </Section>
  )
})
