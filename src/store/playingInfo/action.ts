import state from './state'

export default {
  setPlayingInfo(quality: string, source: string) {
    if (state.quality == quality && state.source == source) return
    state.quality = quality
    state.source = source
    global.state_event.playingInfoUpdated(quality, source)
  },
}
