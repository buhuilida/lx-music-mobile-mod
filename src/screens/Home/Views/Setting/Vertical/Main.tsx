import { memo, useCallback, useEffect, useState } from 'react'
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
import type { InitState as CommonState } from '@/store/common/state'
import { SETTING_SCREENS, SETTING_SCREEN_ICONS, type SettingScreenIds } from '../Main'
import Appearance from '../settings/Appearance'
import Interface from '../settings/Interface'
import Playback from '../settings/Playback'
import Lyric from '../settings/Lyric'
import Download from '../settings/Download'
import SourceSearch from '../settings/SourceSearch'
import DataBackup from '../settings/DataBackup'
import Misc from '../settings/Misc'
import AboutUpdate from '../settings/AboutUpdate'

const Content = memo(({ id }: { id: SettingScreenIds }) => {
  switch (id) {
    case 'appearance': return <Appearance />
    case 'interface': return <Interface />
    case 'playback': return <Playback />
    case 'lyric': return <Lyric />
    case 'download': return <Download />
    case 'source_search': return <SourceSearch />
    case 'data_backup': return <DataBackup />
    case 'misc': return <Misc />
    case 'about_update': return <AboutUpdate />
  }
})

/** 一级：分类列表（图标 + 名称 + 一句话说明） */
const CategoryList = memo(({ onPress }: { onPress: (id: SettingScreenIds) => void }) => {
  const theme = useTheme()
  const t = useI18n()

  const renderItem = useCallback(({ item }: { item: SettingScreenIds }) => (
    <TouchableOpacity
      style={{ ...styles.item, borderBottomColor: theme['c-border-background'] }}
      activeOpacity={0.6}
      onPress={() => { onPress(item) }}
    >
      <Icon name={SETTING_SCREEN_ICONS[item]} size={18} color={theme['c-primary-font']} style={styles.itemIcon} />
      <View style={styles.itemInfo}>
        <Text size={15} numberOfLines={1}>{t(`setting_${item}`)}</Text>
        <Text size={11} color={theme['c-font-label']} numberOfLines={1} style={styles.itemHint}>
          {t(`setting_${item}_hint`)}
        </Text>
      </View>
      <Icon name="chevron-right" size={13} color={theme['c-font-label']} style={styles.itemArrow} />
    </TouchableOpacity>
  ), [onPress, t, theme])

  const getkey = useCallback((item: SettingScreenIds) => item, [])

  return (
    <FlatList
      data={SETTING_SCREENS}
      renderItem={renderItem}
      keyExtractor={getkey}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps={'always'}
    />
  )
})

/** 二级：某一类的详细设置 */
const Detail = memo(({ id, onBack }: { id: SettingScreenIds, onBack: () => void }) => {
  const theme = useTheme()
  const t = useI18n()

  return (
    <View style={styles.detail}>
      <TouchableOpacity
        style={{ ...styles.back, borderBottomColor: theme['c-border-background'] }}
        activeOpacity={0.6}
        onPress={onBack}
      >
        <Icon name="chevron-left" size={13} color={theme['c-primary-font']} style={styles.backIcon} />
        <Text size={13} color={theme['c-primary-font']}>{t('setting_back')}</Text>
      </TouchableOpacity>
      <ScrollView
        keyboardShouldPersistTaps={'always'}
        contentContainerStyle={styles.detailContent}
      >
        <Content id={id} />
      </ScrollView>
    </View>
  )
})

/**
 * 记住当前停留的分类。
 *
 * 「侧边栏项目」里勾选/取消的是首页可滑动页面，页面集合一变，PagerView 必须整体重建
 * （原生层不重建会残留旧的子 View），连带把设置页也卸载重挂了。状态只放在组件里的话，
 * 用户勾一下「搜索」就被踢回分类列表，看起来像「点一下设置就退出去了」。
 * 存到模块作用域后重挂能接着显示原分类；真正离开设置页时清掉，下次进来仍从列表开始。
 */
let lastActiveId: SettingScreenIds | null = null

export default () => {
  // null = 一级分类列表；有值 = 该类的详情页
  const [activeId, setActiveId] = useState<SettingScreenIds | null>(lastActiveId)

  const updateActiveId = useCallback((id: SettingScreenIds | null) => {
    lastActiveId = id
    setActiveId(id)
  }, [])

  const handleBack = useCallback(() => {
    if (activeId == null) return false
    updateActiveId(null)
    return true
  }, [activeId, updateActiveId])

  // 详情页按返回键先回分类列表，而不是直接退出设置
  useBackHandler(handleBack)

  useEffect(() => {
    // 切到其它页面（搜索/歌单…）时清空，避免隔了很久再进设置还停在上次的分类
    const handleNavActiveIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_setting') return
      lastActiveId = null
    }
    global.state_event.on('navActiveIdUpdated', handleNavActiveIdUpdate)
    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavActiveIdUpdate)
    }
  }, [])

  const handlePress = useCallback((id: SettingScreenIds) => {
    updateActiveId(id)
  }, [updateActiveId])
  const handleCloseDetail = useCallback(() => {
    updateActiveId(null)
  }, [updateActiveId])

  return activeId == null
    ? <CategoryList onPress={handlePress} />
    : <Detail id={activeId} onBack={handleCloseDetail} />
}

const styles = createStyle({
  detail: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 15,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 12,
    paddingTop: 11,
    paddingBottom: 11,
    borderBottomWidth: 0.5,
  },
  itemIcon: {
    width: 26,
    textAlign: 'left',
  },
  itemInfo: {
    flex: 1,
    flexShrink: 1,
  },
  itemHint: {
    marginTop: 2,
  },
  itemArrow: {
    marginLeft: 8,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    height: 40,
    borderBottomWidth: 0.5,
  },
  backIcon: {
    marginRight: 6,
  },
  detailContent: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 15,
    paddingBottom: 20,
  },
})
