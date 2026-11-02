import state, { type WyProfile, type WyArtist } from './state'

const emit = () => {
  global.state_event.neteaseUpdated()
}

export default {
  setWyProfile(patch: Partial<WyProfile>) {
    Object.assign(state.profile, patch)
    emit()
  },
  setLikedIds(ids: string[]) {
    state.likedIds = ids
    emit()
  },
  setFollowedArtists(list: WyArtist[]) {
    state.followedArtists = list
    emit()
  },
  setCloudCount(count: number) {
    state.cloudCount = count
    emit()
  },
  setLoading(loading: boolean) {
    state.loading = loading
    emit()
  },
  setInited(inited: boolean) {
    state.inited = inited
    emit()
  },
  reset() {
    state.profile = {
      uid: '',
      nickname: '',
      avatarUrl: '',
      vipType: 0,
      signature: '',
      follows: 0,
      followeds: 0,
      playlistCount: 0,
    }
    state.likedIds = []
    state.followedArtists = []
    state.cloudCount = 0
    state.inited = false
    state.loading = false
    emit()
  },
}
