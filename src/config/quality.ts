/**
 * 音质体系（1.18.0）
 *
 * 统一维护「档位顺序 / 徽标文案 / 徽标颜色 / 文件后缀」，
 * 避免各页面各写一份映射导致新增音质时漏改。
 *
 * 档位由低到高：128K → 192K → 320K → FLAC → FLAC 24bit → Hi-Res → Atmos → Atmos+ → Master
 * ape / wav 为本地或特殊音源，排在无损档位附近，仅用于展示与排序。
 */
export const QUALITY_ORDER: LX.Quality[] = [
  '128k',
  '192k',
  '320k',
  'flac',
  'flac24bit',
  'hires',
  'atmos',
  'atmos_plus',
  'master',
  'ape',
  'wav',
]

/**
 * 播放页 / 下载页 / 音源测试统一使用的音质名称
 *
 * 1.22.17：全部改为与 lxx 一致的中文全名，播放页徽标、下载列表、
 * 设置页共用这一份映射，避免出现「设置里叫臻品母带、徽标还写 Master」。
 */
export const QUALITY_LABELS: Record<string, string> = {
  '128k': '128K 标准',
  '192k': '192K',
  '320k': '320K 高品质',
  flac: 'FLAC 无损',
  flac24bit: '24bit 无损',
  hires: 'Hi-Res 无损',
  atmos: '臻品全景声 Atmos',
  atmos_plus: '臻品全景声 Atmos+',
  master: '臻品母带Master',
  ape: 'APE 无损',
  wav: 'WAV 无损',
  local: '本地',
}

/** 徽标主色：普通 / 无损 / 高解析 / 空间音频 / 母带 分级 */
export const QUALITY_COLORS: Record<string, string> = {
  '128k': '#8A94A6',
  '192k': '#8A94A6',
  '320k': '#2F7CF6',
  flac: '#12A150',
  flac24bit: '#0E9F6E',
  hires: '#C08A00',
  atmos: '#8B5CF6',
  atmos_plus: '#7C3AED',
  master: '#E5484D',
  ape: '#12A150',
  wav: '#12A150',
  local: '#8A94A6',
}

export const getQualityLabel = (quality?: string | null) => {
  if (!quality) return ''
  return QUALITY_LABELS[quality] ?? quality.toUpperCase()
}

/**
 * 设置页 / 下载弹窗使用的中文全名（1.22.15）
 * 现在与 QUALITY_LABELS 同源，保留导出仅为兼容旧引用。
 */
export const QUALITY_FULL_LABELS: Record<string, string> = QUALITY_LABELS

export const getQualityFullLabel = (quality?: string | null) => {
  if (!quality) return ''
  return QUALITY_FULL_LABELS[quality] ?? QUALITY_LABELS[quality] ?? quality.toUpperCase()
}

/**
 * 播放 / 下载音质设置的固定可选列表（1.22.15）
 * 与 lxx 对齐：128k → master 升序，不含 192k（该档仅个别平台有，统一不提供）
 */
export const SELECTABLE_QUALITYS: LX.Quality[] = [
  '128k',
  '320k',
  'flac',
  'flac24bit',
  'hires',
  'atmos',
  'atmos_plus',
  'master',
]

export const getQualityColor = (quality?: string | null) => {
  if (!quality) return QUALITY_COLORS['128k']
  return QUALITY_COLORS[quality] ?? '#8A94A6'
}

/** 音质对应的下载文件后缀 */
export const getQualityFileExt = (quality: LX.Quality): string => {
  switch (quality) {
    case 'flac':
    case 'flac24bit':
    case 'hires':
    case 'atmos':
    case 'atmos_plus':
    case 'master':
      return 'flac'
    case 'ape':
      return 'ape'
    case 'wav':
      return 'wav'
    default:
      return 'mp3'
  }
}

/**
 * 徽标展示档位：部分音源的母带 / 空间音频以 FLAC 容器下发，
 * 按用户实际请求成功的档位展示，避免选了 Master 却显示 FLAC。
 */
export const resolveDisplayQuality = (actual: string, requested?: string) => {
  if (!actual) return ''
  if (requested && requested != actual) {
    const isLosslessContainer = actual == 'flac' || actual == 'flac24bit'
    if (isLosslessContainer && (requested == 'master' || requested == 'atmos' || requested == 'atmos_plus')) {
      return requested
    }
  }
  return actual
}
