import state, { createAccount, type PlatformAccount } from './state'

const emit = () => {
  global.state_event.accountUpdated()
}

type PlatformKey = 'tx' | 'kg'

const patch = (key: PlatformKey, value: Partial<PlatformAccount>) => {
  Object.assign(state[key], value)
  emit()
}

export default {
  setTxAccount(value: Partial<PlatformAccount>) { patch('tx', value) },
  setKgAccount(value: Partial<PlatformAccount>) { patch('kg', value) },
  resetTx() {
    state.tx = createAccount()
    emit()
  },
  resetKg() {
    state.kg = createAccount()
    emit()
  },
}
