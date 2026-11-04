import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ComponentType } from 'react'
import { View } from 'react-native'
import Search from '../Views/Search'
import SongList from '../Views/SongList'
import Mylist from '../Views/Mylist'
import Leaderboard from '../Views/Leaderboard'
import Setting from '../Views/Setting'
import Download from '../Views/Download'
import BaiduPan from '../Views/BaiduPan'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { createStyle } from '@/utils/tools'
import PagerView, { type PageScrollStateChangedNativeEvent, type PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import { setNavActiveId } from '@/core/common'
import settingState from '@/store/setting/state'
import { useSettingValue } from '@/store/setting/hook'
import { getVisiblePagerIds, parseHiddenNavIds } from '@/utils/navMenus'

const hideKeys = [
  'list.isShowAlbumName',
  'list.isShowInterval',
  'theme.fontShadow',
] as Readonly<Array<keyof LX.AppSetting>>

const SearchPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_search')
  const component = useMemo(() => <Search />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_search') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const SongListPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_songlist')
  const component = useMemo(() => <SongList />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_songlist') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
  // return activeId == 1 || activeId == 0  ? SongList : null
}
const LeaderboardPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_top')
  const component = useMemo(() => <Leaderboard />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_top') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const MylistPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_love')
  const component = useMemo(() => <Mylist />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_love') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const DownloadPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_download')
  const component = useMemo(() => <Download />, [])
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_download') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])
  return visible ? component : null
}

const BaiduPanPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_baidu_pan')
  const component = useMemo(() => <BaiduPan />, [])
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_baidu_pan') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])
  return visible ? component : null
}

const SettingPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_setting')
  const component = useMemo(() => <Setting />, [])
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_setting') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])
  return visible ? component : null
}

// 非 pager 页面（一起听 / 本地 / 我的 / 云盘 / 平台设置）都是独立 push 页面，
// 这里给个占位索引，仅为类型完整；滑动顺序见 getVisiblePagerIds()。
const NON_PAGER_INDEX: Record<string, number> = {
  nav_listen: 0,
  nav_local: 0,
  nav_mine: 0,
  nav_cloud: 0,
  nav_platform: 0,
}

/** 可滑动页面 → 组件 */
const PAGER_PAGES: Record<string, ComponentType> = {
  nav_search: SearchPage,
  nav_songlist: SongListPage,
  nav_top: LeaderboardPage,
  nav_love: MylistPage,
  nav_download: DownloadPage,
  nav_baidu_pan: BaiduPanPage,
  nav_setting: SettingPage,
}

const Main = () => {
  const pagerViewRef = useRef<ComponentRef<typeof PagerView>>(null)
  const hiddenNavIds = parseHiddenNavIds(useSettingValue('common.hiddenNavIds'))
  // 顺序直接来自 NAV_MENUS：侧边栏怎么排，左右滑就怎么走，不再单独维护一份顺序
  const indexMap = useMemo(() => getVisiblePagerIds(hiddenNavIds), [hiddenNavIds])
  const viewMap = useMemo(() => {
    const map: Record<string, number> = { ...NON_PAGER_INDEX }
    indexMap.forEach((id, i) => { map[id] = i })
    return map
  }, [indexMap])
  let activeIndexRef = useRef(viewMap[commonState.navActiveId] ?? 0)
  // const isScrollingRef = useRef(false)
  // const scrollPositionRef = useRef(-1)

  // const handlePageScroll = useCallback(({ nativeEvent }) => {
  //   console.log(nativeEvent.offset, activeIndexRef.current)
  //   // if (activeIndexRef.current == -1) return
  //   // if (nativeEvent.offset == 0) {
  //   //   isScrollingRef.current = false

  //   //   const index = nativeEvent.position
  //   //   if (activeIndexRef.current == index) return
  //   //   activeIndexRef.current = index
  //   //   setNavActiveIndex(index)
  //   // } else if (!isScrollingRef.current) {
  //   //   isScrollingRef.current = true
  //   // }
  // }, [setNavActiveIndex])

  const onPageSelected = useCallback(({ nativeEvent }: PagerViewOnPageSelectedEvent) => {
    // console.log(nativeEvent)
    activeIndexRef.current = nativeEvent.position
    if (activeIndexRef.current != viewMap[commonState.navActiveId]) {
      setNavActiveId(indexMap[activeIndexRef.current] as CommonState['navActiveId'])
    }
  }, [indexMap, viewMap])

  const onPageScrollStateChanged = useCallback(({ nativeEvent }: PageScrollStateChangedNativeEvent) => {
    // console.log(nativeEvent)
    const idle = nativeEvent.pageScrollState == 'idle'
    if (global.lx.homePagerIdle != idle) global.lx.homePagerIdle = idle
    // if (nativeEvent.pageScrollState != 'idle') return
    // if (scrollPositionRef.current != commonState.navActiveIndex) {
    //   setNavActiveIndex(scrollPositionRef.current)
    // }
    // if (activeIndexRef.current == -1) return
    // if (nativeEvent.offset == 0) {
    //   isScrollingRef.current = false

    //   const index = nativeEvent.position
    //   if (activeIndexRef.current == index) return
    //   activeIndexRef.current = index
    //   setNavActiveIndex(index)
    // } else if (!isScrollingRef.current) {
    //   isScrollingRef.current = true
    // }
  }, [])

  useEffect(() => {
    const handleUpdate = (id: CommonState['navActiveId']) => {
      const index = viewMap[id]
      if (activeIndexRef.current == index) return
      activeIndexRef.current = index
      pagerViewRef.current?.setPageWithoutAnimation(index)
    }
    const handleConfigUpdate = (keys: Array<keyof LX.AppSetting>, setting: Partial<LX.AppSetting>) => {
      if (!keys.includes('common.homePageScroll')) return
      pagerViewRef.current?.setScrollEnabled(setting['common.homePageScroll']!)
    }
    // window.requestAnimationFrame(() => pagerViewRef.current && pagerViewRef.current.setPage(activeIndexRef.current))
    global.state_event.on('navActiveIdUpdated', handleUpdate)
    global.state_event.on('configUpdated', handleConfigUpdate)
    return () => {
      global.state_event.off('navActiveIdUpdated', handleUpdate)
      global.state_event.off('configUpdated', handleConfigUpdate)
    }
    // viewMap 会随「侧边栏显示项」变化，必须进依赖，否则切换后点侧边栏会跳到旧下标
  }, [viewMap])


  // 当前选中的页面被关掉时，切到第一个还在显示的页面
  useEffect(() => {
    if (indexMap.includes(commonState.navActiveId)) return
    setNavActiveId(indexMap[0] as CommonState['navActiveId'])
  }, [indexMap])

  const component = useMemo(() => (
    <PagerView ref={pagerViewRef}
      // 页面集合变化时整体重建，避免原生层残留旧的子 View
      key={indexMap.join(',')}
      // 重建时按当前选中页算下标（activeIndexRef 是旧的页序号，重建后不可靠）
      initialPage={viewMap[commonState.navActiveId] ?? 0}
      // onPageScroll={handlePageScroll}
      offscreenPageLimit={1}
      onPageSelected={onPageSelected}
      onPageScrollStateChanged={onPageScrollStateChanged}
      scrollEnabled={settingState.setting['common.homePageScroll']}
      style={styles.pagerView}
    >
      {indexMap.map(id => {
        const Page = PAGER_PAGES[id]
        return (
          <View collapsable={false} key={id} style={styles.pageStyle}>
            <Page />
          </View>
        )
      })}
      {/* <View collapsable={false} key="nav_search" style={styles.pageStyle}>
        <Search />
      </View>
      <View collapsable={false} key="nav_songlist" style={styles.pageStyle}>
        <SongList />
      </View>
      <View collapsable={false} key="nav_top" style={styles.pageStyle}>
        <Leaderboard />
      </View>
      <View collapsable={false} key="nav_love" style={styles.pageStyle}>
        <Mylist />
      </View>
      <View collapsable={false} key="nav_setting" style={styles.pageStyle}>
        <Setting />
      </View> */}
    </PagerView>
  ), [onPageScrollStateChanged, onPageSelected, indexMap])

  return component
}

const styles = createStyle({
  pagerView: {
    flex: 1,
    overflow: 'hidden',
  },
  pageStyle: {
    // alignItems: 'center',
    // padding: 20,
  },
})


export default Main

