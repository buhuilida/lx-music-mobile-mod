import { memo } from 'react'
import { View } from 'react-native'

import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { refreshSongNotify } from '@/core/player/notify'
import { refreshSystemLyric } from '@/core/player/systemLyric'
import { stopSpeak } from '@/utils/nativeExt'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const songNotify = useSettingValue('player.songNotify')
  const islandLyric = useSettingValue('player.islandLyric')
  const systemLyric = useSettingValue('player.systemLyric')

  const setSongNotify = (value: boolean) => {
    updateSetting({ 'player.songNotify': value })
    if (!value) void stopSpeak()
  }

  const setIslandLyric = (value: boolean) => {
    updateSetting({ 'player.islandLyric': value })
    setTimeout(() => { refreshSongNotify() }, 50)
  }

  const setSystemLyric = (value: boolean) => {
    updateSetting({ 'player.systemLyric': value })
    setTimeout(() => {
      refreshSystemLyric()
      refreshSongNotify()
    }, 50)
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem check={songNotify} label={t('setting_player_song_notify')} onChange={setSongNotify} />
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_player_song_notify_tip')}</Text>
      <CheckBoxItem check={systemLyric} label={t('setting_player_system_lyric')} onChange={setSystemLyric} />
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_player_system_lyric_tip')}</Text>
      <CheckBoxItem check={islandLyric} label={t('setting_player_island_lyric')} onChange={setIslandLyric} />
      <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_player_island_lyric_tip')}</Text>
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
    marginBottom: 15,
  },
  tip: {
    paddingLeft: 25,
    paddingRight: 15,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 8,
  },
})
