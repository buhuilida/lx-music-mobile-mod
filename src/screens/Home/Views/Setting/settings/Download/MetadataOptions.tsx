import { memo } from 'react'
import { View } from 'react-native'

import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

/**
 * 下载附加选项（1.23.0）
 *
 * 下载完成后写入音频标签 / 封面 / 歌词，走原生模块 react-native-local-media-metadata，
 * 与 lxx 的实现同源。关闭写入标签时，别名一并禁用。
 */
export default memo(() => {
  const t = useI18n()
  const writeMetadata = useSettingValue('download.writeMetadata')
  const writeAlias = useSettingValue('download.writeAlias')
  const writePicture = useSettingValue('download.writePicture')
  const writeLyric = useSettingValue('download.writeLyric')
  const saveLrcFile = useSettingValue('download.saveLrcFile')
  const writeEmbedLyric = useSettingValue('download.writeEmbedLyric')
  const writeRomaLyric = useSettingValue('download.writeRomaLyric')
  const writeWordLyric = useSettingValue('download.writeWordLyric')

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={writeMetadata}
        onChange={(check) => { updateSetting({ 'download.writeMetadata': check }) }}
        label={t('setting_download_write_metadata')}
        helpDesc={t('setting_download_write_metadata_tip')}
      />
      <CheckBoxItem
        check={writeAlias}
        onChange={(check) => { updateSetting({ 'download.writeAlias': check }) }}
        label={t('setting_download_write_alias')}
        disabled={!writeMetadata}
      />
      <CheckBoxItem
        check={writePicture}
        onChange={(check) => { updateSetting({ 'download.writePicture': check }) }}
        label={t('setting_download_write_picture')}
      />
      <CheckBoxItem
        check={writeLyric || saveLrcFile}
        onChange={(check) => {
          // 兼容旧版的 download.saveLrcFile 开关，两个键同步
          updateSetting({ 'download.writeLyric': check, 'download.saveLrcFile': check })
        }}
        label={t('setting_download_write_lyric')}
      />
      <CheckBoxItem
        check={writeEmbedLyric}
        onChange={(check) => { updateSetting({ 'download.writeEmbedLyric': check }) }}
        label={t('setting_download_write_embed_lyric')}
        helpDesc={t('setting_download_write_embed_lyric_tip')}
      />
      <CheckBoxItem
        check={writeRomaLyric}
        onChange={(check) => { updateSetting({ 'download.writeRomaLyric': check }) }}
        label={t('setting_download_write_roma_lyric')}
        disabled={!writeLyric && !writeEmbedLyric}
      />
      <CheckBoxItem
        check={writeWordLyric}
        onChange={(check) => { updateSetting({ 'download.writeWordLyric': check }) }}
        label={t('setting_download_write_word_lyric')}
        helpDesc={t('setting_download_write_word_lyric_tip')}
        disabled={!writeLyric && !writeEmbedLyric}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
