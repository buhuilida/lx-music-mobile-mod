import { useEffect, useState } from 'react'
import state from './state'

export const usePlayingInfo = () => {
  const [value, update] = useState({ quality: state.quality, source: state.source, requested: state.requested })

  useEffect(() => {
    const handleUpdate: typeof global.state_event.playingInfoUpdated = (quality, source, requested) => {
      update({ quality, source, requested: requested ?? quality })
    }
    global.state_event.on('playingInfoUpdated', handleUpdate)
    return () => {
      global.state_event.off('playingInfoUpdated', handleUpdate)
    }
  }, [])

  return value
}
