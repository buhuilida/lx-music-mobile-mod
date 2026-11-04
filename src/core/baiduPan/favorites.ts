/**
 * 常用网盘目录
 *
 * 为什么不直接存数组：设置的合并逻辑（config/setting.ts mergeSetting）
 * 只接受 string / number / boolean，数组会被当成非法值丢弃 ——
 * 存数组的话，改完设置既不生效也不会持久化。所以统一按 JSON 字符串存取。
 */

export const parseFavorites = (raw?: string | null): string[] => {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : []
  } catch {
    return []
  }
}

export const serializeFavorites = (list: string[]): string => {
  return JSON.stringify(Array.from(new Set(list.map((item) => item.trim()).filter(Boolean))))
}

export const normalizeDirPath = (dir: string) => {
  if (!dir) return '/'
  const trimmed = dir.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
