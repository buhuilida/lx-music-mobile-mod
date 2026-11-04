import { memo } from 'react'
import { View } from 'react-native'

import { NAV_MENUS } from '@/config/constant'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { parseHiddenNavIds } from '@/utils/navMenus'
import Text from '@/components/common/Text'

import CheckBoxItem from '../../components/CheckBoxItem'

/**
 * 侧边栏显示项。
 *
 * 勾选即显示；关掉的项同时也不会出现在首页左右滑动里，
 * 因为滑动顺序直接按侧边栏顺序生成（见 utils/navMenus.getVisiblePagerIds）。
 */
export default memo(() => {
  const t = useI18n()
  const hiddenIds = parseHiddenNavIds(useSettingValue('common.hiddenNavIds'))

  const toggle = (id: string, show: boolean) => {
    const next = show
      ? hiddenIds.filter(item => item !== id)
      : Array.from(new Set([...hiddenIds, id]))
    // 至少留一项，全部关掉侧边栏就空了
    if (next.length >= NAV_MENUS.length) return
    updateSetting({ 'common.hiddenNavIds': JSON.stringify(next) })
  }

  return (
    <View style={styles.content}>
      <Text size={11} color="rgba(128,128,128,0.9)" style={styles.tip}>{t('setting_nav_menus_tip')}</Text>
      {NAV_MENUS.map(menu => (
        <CheckBoxItem
          key={menu.id}
          check={!hiddenIds.includes(menu.id)}
          label={t(menu.id)}
          onChange={(check: boolean) => { toggle(menu.id, check) }}
        />
      ))}
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
  tip: {
    paddingLeft: 25,
    paddingBottom: 6,
  },
})
