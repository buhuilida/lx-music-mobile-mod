import { memo } from 'react'
import { View, TouchableOpacity } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle, confirmDialog } from '@/utils/tools'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useListenTogetherRoom, useListenTogetherStatus } from '@/store/listenTogether/hook'
import { leaveRoom } from '@/core/listenTogether'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const { room, isHost } = useListenTogetherRoom()
  const { status } = useListenTogetherStatus()

  const back = () => {
    void pop(componentId)
  }

  const handleLeave = () => {
    void confirmDialog({
      message: t('listen_together_leave_tip'),
      confirmButtonText: t('listen_together_leave'),
    }).then(confirm => {
      if (!confirm) return
      leaveRoom()
    })
  }

  const statusText = (() => {
    switch (status) {
      case 'connected': return t('listen_together_connected')
      case 'connecting': return t('listen_together_connecting')
      case 'reconnecting': return t('listen_together_reconnecting_short')
      case 'error': return t('listen_together_disconnected')
      default: return ''
    }
  })()

  return (
    <View style={{
      height: HEADER_HEIGHT + statusBarHeight,
      paddingTop: statusBarHeight,
      backgroundColor: theme['c-primary-light-1000-alpha-200'],
      borderBottomWidth: 1,
      borderBottomColor: theme['c-border-background'],
    }}>
      <StatusBar />
      <View style={styles.container}>
        <TouchableOpacity onPress={back} style={{ ...styles.button, width: HEADER_HEIGHT }}>
          <Icon name="chevron-left" size={18} />
        </TouchableOpacity>
        <View style={styles.titleContent}>
          <Text numberOfLines={1} size={16} style={styles.title}>{room?.name ?? t('listen_together')}</Text>
          <View style={styles.statusContent}>
            <View style={{ ...styles.dot, backgroundColor: status == 'connected' ? theme['c-primary'] : theme['c-font-label'] }} />
            <Text size={11} color={theme['c-font-label']} numberOfLines={1}>{statusText}</Text>
            {room && isHost ? <Text size={11} color={theme['c-font-label']} numberOfLines={1}>{`  ${t('listen_together_host')}`}</Text> : null}
          </View>
        </View>
        {
          room
            ? (
              <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
                <Text size={13} color={theme['c-font']}>{t('listen_together_leave')}</Text>
              </TouchableOpacity>
              )
            : <View style={{ width: HEADER_HEIGHT }} />
        }
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 10,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  title: {
    // textAlign: 'center',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  leaveBtn: {
    paddingLeft: 12,
    paddingRight: 6,
    paddingTop: 6,
    paddingBottom: 6,
  },
})
