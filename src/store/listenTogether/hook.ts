import { useEffect, useState } from 'react'
import state from './state'

export const useListenTogetherStatus = () => {
  const [value, update] = useState({ status: state.status, errorMessage: state.errorMessage })

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherStatusUpdated = (status, errorMessage) => {
      update({ status, errorMessage })
    }
    global.state_event.on('listenTogetherStatusUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherStatusUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useListenTogetherRoom = () => {
  const [value, update] = useState({ room: state.room, selfId: state.selfId, isHost: state.isHost })

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherRoomUpdated = (room, selfId, isHost) => {
      update({ room, selfId, isHost })
    }
    global.state_event.on('listenTogetherRoomUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherRoomUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useListenTogetherMessages = () => {
  const [value, update] = useState(state.messages)

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherMessagesUpdated = (messages) => {
      update(messages)
    }
    global.state_event.on('listenTogetherMessagesUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherMessagesUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useListenTogetherSync = () => {
  const [value, update] = useState({ syncStatus: state.syncStatus, syncText: state.syncText })

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherSyncUpdated = (syncStatus, syncText) => {
      update({ syncStatus, syncText })
    }
    global.state_event.on('listenTogetherSyncUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherSyncUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useListenTogetherPlayback = () => {
  const [value, update] = useState({ playback: state.playback, lastSyncAt: state.lastSyncAt })

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherPlaybackUpdated = (playback, lastSyncAt) => {
      update({ playback, lastSyncAt })
    }
    global.state_event.on('listenTogetherPlaybackUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherPlaybackUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useListenTogetherLyric = () => {
  const [value, update] = useState(state.lyric)

  useEffect(() => {
    const handleUpdate: typeof global.state_event.listenTogetherLyricUpdated = (lyric) => {
      update(lyric)
    }
    global.state_event.on('listenTogetherLyricUpdated', handleUpdate)
    return () => {
      global.state_event.off('listenTogetherLyricUpdated', handleUpdate)
    }
  }, [])

  return value
}
