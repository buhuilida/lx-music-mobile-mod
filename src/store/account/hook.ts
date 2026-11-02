import { useEffect, useState } from 'react'
import state, { type PlatformAccount } from './state'

export const useTxAccount = () => {
  const [value, update] = useState<PlatformAccount>({ ...state.tx })
  useEffect(() => {
    const handleUpdate = () => { update({ ...state.tx }) }
    global.state_event.on('accountUpdated', handleUpdate)
    return () => { global.state_event.off('accountUpdated', handleUpdate) }
  }, [])
  return value
}

export const useKgAccount = () => {
  const [value, update] = useState<PlatformAccount>({ ...state.kg })
  useEffect(() => {
    const handleUpdate = () => { update({ ...state.kg }) }
    global.state_event.on('accountUpdated', handleUpdate)
    return () => { global.state_event.off('accountUpdated', handleUpdate) }
  }, [])
  return value
}
