import type { I18n } from '@/lang/i18n'

type MessageKey = Parameters<I18n['t']>[0]

/**
 * 允许服务端下发的系统消息 key，避免任意 key 被当成多语言文案
 */
const systemKeys: MessageKey[] = [
  'listen_together_system_join',
  'listen_together_system_leave',
  'listen_together_system_back',
  'listen_together_system_created',
  'listen_together_system_host_changed',
]

export const localizeSystemMessage = (message: LX.ListenTogether.ChatMessage) => {
  if (message.type != 'system' || !message.key) return message
  const key = message.key as MessageKey
  if (!systemKeys.includes(key)) return message
  return {
    ...message,
    text: global.i18n.t(key, message.params),
  }
}
