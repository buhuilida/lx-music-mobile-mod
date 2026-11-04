/**
 * 下载前的歌词探测
 *
 * 目的：点击下载时先知道「有没有逐字歌词 / 有没有歌词」，据此给不同提示。
 * - 走 getLyricInfo（内部优先读缓存），播放过的歌基本秒出
 * - 批量时限制并发，避免一次打满网络
 * - 探测失败（网络错误）按「仅逐行」处理，不阻断下载
 */
import { getLyricInfo } from '@/core/music'

export type LyricProbeState = 'word' | 'line' | 'none'

export interface LyricProbeResult<T extends LX.Music.MusicInfo = LX.Music.MusicInfo> {
  musicInfo: T
  state: LyricProbeState
}

export const probeLyric = async(musicInfo: LX.Music.MusicInfo): Promise<LyricProbeState> => {
  try {
    const info = await getLyricInfo({ musicInfo })
    const lyric = info?.lyric ?? ''
    const lxlyric = info?.lxlyric ?? ''
    if (lxlyric.trim()) return 'word'
    if (lyric.trim()) return 'line'
    return 'none'
  } catch (err: any) {
    console.log('[歌词探测] 失败，按仅逐行处理:', musicInfo.name, err?.message ?? err)
    return 'line'
  }
}

export interface ProbeLyricsOptions {
  /** 并发数，默认 4 */
  concurrency?: number
  /** 每完成一首回调一次 */
  onProgress?: (finished: number, total: number) => void
}

/** 并发探测多首歌曲的歌词情况 */
export const probeLyrics = async<T extends LX.Music.MusicInfo>(
  musicInfos: T[],
  options: ProbeLyricsOptions = {}
): Promise<LyricProbeResult<T>[]> => {
  const total = musicInfos.length
  if (!total) return []
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 6))
  const results: LyricProbeResult<T>[] = new Array(total)
  let cursor = 0
  let finished = 0

  const worker = async() => {
    while (cursor < total) {
      const index = cursor
      cursor++
      const musicInfo = musicInfos[index]
      const state = await probeLyric(musicInfo)
      results[index] = { musicInfo, state }
      finished++
      options.onProgress?.(finished, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  return results
}
