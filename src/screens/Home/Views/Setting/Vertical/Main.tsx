import { memo, useCallback, useState } from 'react'
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
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

export default () => {
  // null = 一级分类列表；有值 = 该类的详情页
  const [activeId, setActiveId] = useState<SettingScreenIds | null>(null)

  const handleBack = useCallback(() => {
    if (activeId == null) return false
    setActiveId(null)
    return true
  }, [activeId])

  // 详情页按返回键先回分类列表，而不是直接退出设置
  useBackHandler(handleBack)

  const handlePress = useCallback((id: SettingScreenIds) => {
    setActiveId(id)
  }, [])
  const handleCloseDetail = useCallback(() => {
    setActiveId(null)
  }, [])

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
