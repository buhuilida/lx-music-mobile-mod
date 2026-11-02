import state from './state'

export default {
  setPlayingInfo(quality: string, source: string, requested: string = quality) {
    if (state.quality == quality && state.source == source && state.requested == requested) return
    state.quality = quality
    state.source = source
    state.requested = requested
    global.state_event.playingInfoUpdated(quality, source, requested)
  },
}
