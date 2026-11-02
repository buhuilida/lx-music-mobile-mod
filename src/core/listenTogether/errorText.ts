import type { I18n } from '@/lang/i18n'

type MessageKey = Parameters<I18n['t']>[0]

const errorKeys: Record<string, MessageKey> = {
  bad_request: 'listen_together_error_bad_request',
  room_not_found: 'listen_together_error_room_not_found',
  wrong_password: 'listen_together_error_wrong_password',
  room_full: 'listen_together_error_room_full',
  already_in_room: 'listen_together_error_already_in_room',
  not_host: 'listen_together_error_not_host',
  rate_limited: 'listen_together_error_rate_limited',
  network_error: 'listen_together_error_network',
  server_error: 'listen_together_error_server',
}

export const getListenTogetherErrorText = (code: string, fallback?: string) => {
  const key = errorKeys[code]
  if (key) return global.i18n.t(key)
  if (fallback) return fallback
  return global.i18n.t('listen_together_error_unknown')
}
