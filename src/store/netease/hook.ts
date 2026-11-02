import { useEffect, useState } from 'react'
import state from './state'

export const useNetease = () => {
  const [value, update] = useState({
    profile: { ...state.profile },
    likedIds: state.likedIds,
    followedArtists: state.followedArtists,
    cloudCount: state.cloudCount,
    inited: state.inited,
    loading: state.loading,
  })

  useEffect(() => {
    const handleUpdate = () => {
      update({
        profile: { ...state.profile },
        likedIds: state.likedIds,
        followedArtists: state.followedArtists,
        cloudCount: state.cloudCount,
        inited: state.inited,
        loading: state.loading,
      })
    }
    global.state_event.on('neteaseUpdated', handleUpdate)
    return () => {
      global.state_event.off('neteaseUpdated', handleUpdate)
    }
  }, [])

  return value
}

export const useWyProfile = () => useNetease().profile
