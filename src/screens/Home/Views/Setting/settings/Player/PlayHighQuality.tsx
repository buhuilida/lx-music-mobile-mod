import { memo, useMemo } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { QUALITY_LABELS, QUALITY_ORDER } from '@/config/quality'

const useActive = (id: LX.Quality) => {
  const q = useSettingValue('player.playQuality')
  const isActive = useMemo(() => q == id, [q, id])
  return isActive
}

const Item = ({ id, name }: {
  id: LX.Quality
  name: string
}) => {
  const isActive = useActive(id)
  // const [toggleCheckBox, setToggleCheckBox] = useState(false)
  return <CheckBox marginRight={8} check={isActive} label={name} onChange={() => { updateSetting({ 'player.playQuality': id }) }} need />
}

export default memo(() => {
  const t = useI18n()
  const playQualityList = useMemo(() => {
    // 由高到低展示：Master / Atmos+ / Atmos / Hi-Res / FLAC 24bit / FLAC / 320K / 192K / 128K
    return QUALITY_ORDER.filter(q => q != 'ape' && q != 'wav').reverse()
  }, [])

  return (
    <SubTitle title={t('setting_play_play_quality')}>
      <View style={styles.list}>
        {
          playQualityList.map((q) => <Item name={QUALITY_LABELS[q] ?? q} id={q} key={q} />)
        }
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})


// export default memo(() => {
//   const t = useI18n()
//   const isPlayHighQuality = useSettingValue('player.isPlayHighQuality')
//   const setPlayHighQuality = (isPlayHighQuality: boolean) => {
//     updateSetting({ 'player.isPlayHighQuality': isPlayHighQuality })
//   }

//   return (
//     <View style={styles.content}>
//       <CheckBoxItem check={isPlayHighQuality} onChange={setPlayHighQuality} label={t('setting_play_quality')} />
//     </View>
//   )
// })


// const styles = createStyle({
//   content: {
//     marginTop: 5,
//   },
// })

