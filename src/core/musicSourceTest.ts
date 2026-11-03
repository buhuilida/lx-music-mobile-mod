import musicSdk from '@/utils/musicSdk'

/**
 * 音源测试（1.16.0，参照 LX-X 的音源质量测试）
 * 按平台搜索一首歌，逐档尝试获取播放地址，得到实际可用的最高音质。
 */
export const TEST_SOURCES = [
  { id: 'kw', name: '酷我' },
  { id: 'kg', name: '酷狗' },
  { id: 'tx', name: 'QQ' },
  { id: 'wy', name: '网易' },
  { id: 'mg', name: '咪咕' },
] as const

export type SourceTestId = typeof TEST_SOURCES[number]['id']

export interface SourceTestResult {
  source: SourceTestId
  status: 'idle' | 'testing' | 'ok' | 'fail'
  quality?: string
  song?: string
  message?: string
}

const QUALITY_ORDER = ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'] as const

const withTimeout = async<T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const TEST_TIMEOUT = 10_000

export const testSource = async(source: SourceTestId, keyword: string): Promise<SourceTestResult> => {
  const sdk = (musicSdk as unknown as Record<string, { musicSearch?: { search: (kw: string, page: number, limit: number) => Promise<{ list?: any[] }> }, getMusicUrl?: (info: any, type: string) => { promise?: Promise<string> } | string }>)
  const mod = sdk[source]
  if (!mod?.musicSearch || !mod?.getMusicUrl) {
    return { source, status: 'fail', message: '平台不可用' }
  }
  try {
    const result = await withTimeout(mod.musicSearch.search(keyword, 1, 1), TEST_TIMEOUT)
    const first = result?.list?.[0]
    if (!first) return { source, status: 'fail', message: '搜索无结果' }
    const songName = first.name ?? first.songmid ?? ''
    let highest: string | null = null
    let lastError = ''
    for (const quality of QUALITY_ORDER) {
      try {
        const req = mod.getMusicUrl(first, quality)
        const promise = typeof req == 'string' ? Promise.reject(new Error('api failed')) : (req.promise ?? Promise.reject(new Error('api failed')))
        await withTimeout(promise as Promise<string>, 8_000)
        highest = quality
      } catch (err) {
        lastError = (err as Error).message ?? ''
        // 高音质失败继续尝试更低档位
      }
    }
    if (highest) return { source, status: 'ok', quality: highest, song: songName }
    return { source, status: 'fail', song: songName, message: lastError || '所有音质均获取失败' }
  } catch (err) {
    return { source, status: 'fail', message: (err as Error).message }
  }
}

/** 全部平台并发测试 */
export const testAllSources = async(keywords: Partial<Record<SourceTestId, string>>, onProgress: (result: SourceTestResult) => void) => {
  const tasks = TEST_SOURCES.map(async({ id }) => {
    const keyword = keywords[id]?.trim() || '晴天'
    const result = await testSource(id, keyword).catch(err => ({
      source: id,
      status: 'fail' as const,
      message: (err as Error).message,
    }))
    onProgress(result)
    return result
  })
  return Promise.all(tasks)
}
