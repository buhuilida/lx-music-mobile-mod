// @flow

import { Navigation } from 'react-native-navigation'

import {
  Home,
  PlayDetail,
  SonglistDetail,
  Comment,
  ListenTogether,
  Download,
  LocalMusic,
  PlatformSetting,
  DirectoryPicker,
  NeteaseMine,
  NeteaseDaily,
  NeteaseFollowed,
  NeteaseCloud,
  NeteaseLiked,
  NeteasePlaylists,
  NeteaseArtist,
  NeteaseAlbums,
  NeteaseAlbumSongs,
  PlatformList,
  // Setting,
} from '@/screens'
import { Provider } from '@/store/Provider'

import {
  HOME_SCREEN,
  PLAY_DETAIL_SCREEN,
  SONGLIST_DETAIL_SCREEN,
  COMMENT_SCREEN,
  LISTEN_TOGETHER_SCREEN,
  DOWNLOAD_SCREEN,
  LOCAL_MUSIC_SCREEN,
  PLATFORM_SETTING_SCREEN,
  DIRECTORY_PICKER_SCREEN,
  NETEASE_MINE_SCREEN,
  NETEASE_DAILY_SCREEN,
  NETEASE_FOLLOWED_SCREEN,
  NETEASE_CLOUD_SCREEN,
  NETEASE_LIKED_SCREEN,
  NETEASE_PLAYLISTS_SCREEN,
  NETEASE_ARTIST_SCREEN,
  NETEASE_ALBUMS_SCREEN,
  NETEASE_ALBUM_SONGS_SCREEN,
  PLATFORM_LIST_SCREEN,
  VERSION_MODAL,
  PACT_MODAL,
  SYNC_MODE_MODAL,
  // SETTING_SCREEN,
} from './screenNames'
import VersionModal from './components/VersionModal'
import PactModal from './components/PactModal'
import SyncModeModal from './components/SyncModeModal'

function WrappedComponent(Component: any) {
  return function inject(props: Record<string, any>) {
    const EnhancedComponent = () => (
      <Provider>
        <Component
          {...props}
        />
      </Provider>
    )

    return <EnhancedComponent />
  }
}

export default () => {
  Navigation.registerComponent(HOME_SCREEN, () => WrappedComponent(Home))
  Navigation.registerComponent(PLAY_DETAIL_SCREEN, () => WrappedComponent(PlayDetail))
  Navigation.registerComponent(SONGLIST_DETAIL_SCREEN, () => WrappedComponent(SonglistDetail))
  Navigation.registerComponent(COMMENT_SCREEN, () => WrappedComponent(Comment))
  Navigation.registerComponent(LISTEN_TOGETHER_SCREEN, () => WrappedComponent(ListenTogether))
  Navigation.registerComponent(DOWNLOAD_SCREEN, () => WrappedComponent(Download))
  Navigation.registerComponent(LOCAL_MUSIC_SCREEN, () => WrappedComponent(LocalMusic))
  Navigation.registerComponent(PLATFORM_SETTING_SCREEN, () => WrappedComponent(PlatformSetting))
  Navigation.registerComponent(DIRECTORY_PICKER_SCREEN, () => WrappedComponent(DirectoryPicker))
  Navigation.registerComponent(NETEASE_MINE_SCREEN, () => WrappedComponent(NeteaseMine))
  Navigation.registerComponent(NETEASE_DAILY_SCREEN, () => WrappedComponent(NeteaseDaily))
  Navigation.registerComponent(NETEASE_FOLLOWED_SCREEN, () => WrappedComponent(NeteaseFollowed))
  Navigation.registerComponent(NETEASE_CLOUD_SCREEN, () => WrappedComponent(NeteaseCloud))
  Navigation.registerComponent(NETEASE_LIKED_SCREEN, () => WrappedComponent(NeteaseLiked))
  Navigation.registerComponent(NETEASE_PLAYLISTS_SCREEN, () => WrappedComponent(NeteasePlaylists))
  Navigation.registerComponent(NETEASE_ARTIST_SCREEN, () => WrappedComponent(NeteaseArtist))
  Navigation.registerComponent(NETEASE_ALBUMS_SCREEN, () => WrappedComponent(NeteaseAlbums))
  Navigation.registerComponent(NETEASE_ALBUM_SONGS_SCREEN, () => WrappedComponent(NeteaseAlbumSongs))
  Navigation.registerComponent(PLATFORM_LIST_SCREEN, () => WrappedComponent(PlatformList))
  Navigation.registerComponent(VERSION_MODAL, () => WrappedComponent(VersionModal))
  Navigation.registerComponent(PACT_MODAL, () => WrappedComponent(PactModal))
  Navigation.registerComponent(SYNC_MODE_MODAL, () => WrappedComponent(SyncModeModal))
  // Navigation.registerComponent(SETTING_SCREEN, () => WrappedComponent(Setting))

  console.info('All screens have been registered...')
}
