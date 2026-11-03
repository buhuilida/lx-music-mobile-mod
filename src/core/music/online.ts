import {
  saveLyric,
  saveMusicUrl,
  getMusicUrl as getStoreMusicUrl,
} from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import playingInfoActions from '@/store/playingInfo/action'

import {
  buildLyricInfo,
  getPlayQuality,
  getQualityFallbacks,
  getSongQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo,
} from './utils'

/* export const setMusicUrl = ({ musicInfo, type, url }: {
  musicInfo: LX.Music.MusicInfo
  type: LX.Quality
  url: string
}) => {
  saveMusicUrl(musicInfo, type, url)
}

export const setPic = (datas: {
  listId: string
  musicInfo: LX.Music.MusicInfo
  url: string
}) => {
  datas.musicInfo.img = datas.url
  updateMusicInfo({
    listId: datas.listId,
    id: datas.musicInfo.songmid,
    data: { img: datas.url },
    musicInfo: datas.musicInfo,
  })
}
 */


/**
 * 一起听房间的统一音质
 * 房主设置了 320k 之后，即使成员本地设置的是 128k，也要按房间音质取地址
 */
let qualityOverride: LX.Quality | null = null

export const setQualityOverride = (quality: LX.Quality | null) => {
  qualityOverride = quality
}

export const getQualityOverride = () => qualityOverride

export const getMusicUrl = async({ musicInfo, quality, isRefresh, allowToggleSource = true, onToggleSource = () => {}, onQuality }: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  /** 实际生效的音质（回退后与请求档位可能不同，下载层用它给文件标注，1.22.16） */
  onQuality?: (quality: LX.Quality) => void
}): Promise<string> => {
  // if (!musicInfo._types[type]) {
  //   // 兼容旧版酷我源搜索列表过滤128k音质的bug
  //   if (!(musicInfo.source == 'kw' && type == '128k')) throw new Error('该歌曲没有可播放的音频')

  //   // return Promise.reject(new Error('该歌曲没有可播放的音频'))
  // }
  const targetQuality = quality ?? qualityOverride ?? getPlayQuality(settingState.setting['player.playQuality'], musicInfo)

  // 只有当前正在播放的歌曲才更新播放页徽标，避免预加载/下载把别的歌的音质写进去
  const applyPlayingInfo = (actualQuality: LX.Quality, source: LX.OnlineSource, requestedQuality: LX.Quality = targetQuality) => {
    const current = playerState.playMusicInfo.musicInfo
    if (current && current.id != musicInfo.id) return
    playingInfoActions.setPlayingInfo(actualQuality, source, requestedQuality)
  }

  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) {
    // 命中缓存时也要更新徽标，否则切换音质后徽标会停留在上一首/上一次的结果
    applyPlayingInfo(targetQuality, musicInfo.source)
    onQuality?.(targetQuality)
    return cachedUrl
  }

  const applyResult = ({ url, quality: actualQuality, musicInfo: targetMusicInfo, isFromCache }: {
    url: string
    quality: LX.Quality
    musicInfo: LX.Music.MusicInfoOnline
    isFromCache: boolean
  }, requestedQuality: LX.Quality) => {
    if (targetMusicInfo.id != musicInfo.id && !isFromCache) void saveMusicUrl(targetMusicInfo, actualQuality, url)
    void saveMusicUrl(musicInfo, actualQuality, url)
    // 记录实际播放音质与音源（1.15.0 播放页徽标）
    applyPlayingInfo(actualQuality, targetMusicInfo.source, requestedQuality)
    onQuality?.(actualQuality)
    return url
  }

  const fallbackQuality = getSongQuality(musicInfo)
  // 用户设置的档位高于歌曲元信息里的档位（元信息可能是旧的），先按高档位请求，失败再快速回退
  const isUpgraded = fallbackQuality != targetQuality
  // 升级档位时的回退链：声明档位 → 歌曲自身档位 → 128k（1.22.16）
  const fallbackChain = isUpgraded ? getQualityFallbacks(targetQuality, musicInfo) : []
  if (fallbackChain.length) {
    console.log('[quality] request', musicInfo.source, targetQuality, 'fallbacks:', fallbackChain.join('->'))
  }

  const request = async(requestQuality: LX.Quality, allowToggle = allowToggleSource) => handleGetOnlineMusicUrl({
    musicInfo,
    quality: requestQuality,
    onToggleSource,
    isRefresh,
    allowToggleSource: allowToggle,
  })

  // 升级档位的首次请求不做跨音源搜索，失败后立刻按回退链重试，避免播放前长时间卡住
  return request(targetQuality, isUpgraded ? false : allowToggleSource)
    .then(res => applyResult(res, targetQuality))
    .catch(async(err) => {
      if (!fallbackChain.length) throw err
      let lastErr: unknown = err
      for (const chainQuality of fallbackChain) {
        try {
          console.log('[quality] fallback to', chainQuality)
          const res = await request(chainQuality)
          return applyResult(res, chainQuality)
        } catch (chainErr) {
          lastErr = chainErr
        }
      }
      throw lastErr
    })
}

export const getPicUrl = async({ musicInfo, listId, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(({ url, musicInfo: targetMusicInfo, isFromCache }) => {
    // picRequest = null
    if (listId) {
      musicInfo.meta.picUrl = url
      void updateListMusics([{ id: listId, musicInfo }])
    }
    // savePic({ musicInfo, url, listId })
    return url
  })
}
export const getLyricInfo = async({ musicInfo, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  // lrcRequest = music[musicInfo.source].getLyric(musicInfo)
  return handleGetOnlineLyricInfo({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(async({ lyricInfo, musicInfo: targetMusicInfo, isFromCache }) => {
    // lrcRequest = null
    if (isFromCache) return buildLyricInfo(lyricInfo)
    if (targetMusicInfo.id == musicInfo.id) void saveLyric(musicInfo, lyricInfo)
    else void saveLyric(targetMusicInfo, lyricInfo)

    return buildLyricInfo(lyricInfo)
  })
}
