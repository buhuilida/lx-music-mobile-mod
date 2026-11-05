import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'

import Appearance from './settings/Appearance'
import Interface from './settings/Interface'
import Playback from './settings/Playback'
import Lyric from './settings/Lyric'
import Download from './settings/Download'
import SourceSearch from './settings/SourceSearch'
import DataBackup from './settings/DataBackup'
import Misc from './settings/Misc'
import AboutUpdate from './settings/AboutUpdate'

/**
 * 设置一级分类。
 *
 * 之前是 11 个 Section 拼在一条长列表里（基本设置 16 项、播放设置 18 项），
 * 想改靠下的一项要滑很久；而搜索、备份、更新各自只有 1~2 项也占一个位置。
 * 现在按用途收敛成 9 类，点进去才展开该类内容。
 */
export const SETTING_SCREENS = [
  'appearance',
  'interface',
  'playback',
  'lyric',
  'download',
  'source_search',
  'data_backup',
  'misc',
  'about_update',
] as const

export type SettingScreenIds = typeof SETTING_SCREENS[number]

/** 一级列表用的图标（取自内置 iconfont，名字必须在 selection.json 里存在） */
export const SETTING_SCREEN_ICONS: Record<SettingScreenIds, string> = {
  appearance: 'logo',
  interface: 'menu',
  playback: 'play-outline',
  lyric: 'lyric-on',
  download: 'download-2',
  source_search: 'search-2',
  data_backup: 'sd-card',
  misc: 'dots-vertical',
  about_update: 'available_updates',
}

// interface MainProps {
//   onUpdateActiveId: (id: string) => void
// }
export interface MainType {
  setActiveId: (id: SettingScreenIds) => void
}

const Main = forwardRef<MainType, {}>((props, ref) => {
  const [id, setId] = useState(global.lx.settingActiveId)

  useImperativeHandle(ref, () => ({
    setActiveId(id) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setId(id)
        })
      })
    },
  }))

  const component = useMemo(() => {
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
      default: return <Appearance />
    }
  }, [id])

  return component
})


export default Main
