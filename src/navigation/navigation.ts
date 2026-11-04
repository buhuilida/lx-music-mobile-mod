import { Navigation } from 'react-native-navigation'
// import { InteractionManager } from 'react-native'

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
  THEME_MANAGER_SCREEN,
  WEBDAV_SCREEN,
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
  PLATFORM_SONGS_SCREEN,
  BAIDU_PAN_LOGIN_SCREEN,
  BAIDU_PAN_DIR_SCREEN,
  // SETTING_SCREEN,
} from './screenNames'

import themeState from '@/store/theme/state'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { getStatusBarStyle } from './utils'
import { windowSizeTools } from '@/utils/windowSizeTools'
import { type ListInfoItem } from '@/store/songlist/state'

// const store = getStore()
// const getTheme = () => getter('common', 'theme')(store.getState())

/**
 * 防连点导航（1.22.18）
 *
 * 之前的 push 没有做任何去重，手指快速连点两次就会 push 两个同样的页面。
 * 新页面 push 的瞬间上层还是空白的（导航原生容器背景 + 透明状态栏），
 * 观感就是「点快了会黑一下」，返回时还要多按一次。
 * 这里对同一个 componentId + 页面 + 参数做 400ms 去重，正常操作完全无感。
 */
const PUSH_GUARD_MS = 400
const recentPushes = new Map<string, number>()
function shouldSkipPush(componentId: string, name: string, passProps?: Record<string, any>) {
  let id = ''
  if (passProps) {
    try {
      id = JSON.stringify(passProps)
    } catch {
      id = ''
    }
  }
  const key = `${componentId}:${name}:${id}`
  const now = Date.now()
  const last = recentPushes.get(key)
  if (last != null && now - last < PUSH_GUARD_MS) return true
  recentPushes.set(key, now)
  if (recentPushes.size > 40) {
    for (const [k, t] of recentPushes) {
      if (now - t > PUSH_GUARD_MS * 4) recentPushes.delete(k)
    }
  }
  return false
}

export async function pushHomeScreen() {
  /*
    Navigation.setDefaultOptions({
      topBar: {
        background: {
          color: '#039893',
        },
        title: {
          color: 'white',
        },
        backButton: {
          title: '', // Remove previous screen name from back button
          color: 'white',
        },
        buttonColor: 'white',
      },
      statusBar: {
        style: 'light',
      },
      layout: {
        orientation: ['portrait'],
      },
      bottomTabs: {
        titleDisplayMode: 'alwaysShow',
      },
      bottomTab: {
        textColor: 'gray',
        selectedTextColor: 'black',
        iconColor: 'gray',
        selectedIconColor: 'black',
      },
    })
  */

  const theme = themeState.theme
  return Navigation.setRoot({
    root: {
      stack: {
        children: [{
          component: {
            name: HOME_SCREEN,
            options: {
              topBar: {
                visible: false,
                height: 0,
                drawBehind: false,
              },
              statusBar: {
                drawBehind: true,
                visible: true,
                style: getStatusBarStyle(theme.isDark),
                backgroundColor: 'transparent',
              },
              navigationBar: {
                // visible: false,
                backgroundColor: theme['c-content-background'],
              },
              layout: {
                componentBackgroundColor: theme['c-content-background'],
              },
            },
          },
        }],
      },
    },
  })
}
export function pushPlayDetailScreen(componentId: string, skipAnimation = false) {
  if (shouldSkipPush(componentId, PLAY_DETAIL_SCREEN)) return
  /*
    Navigation.setDefaultOptions({
      topBar: {
        background: {
          color: '#039893',
        },
        title: {
          color: 'white',
        },
        backButton: {
          title: '', // Remove previous screen name from back button
          color: 'white',
        },
        buttonColor: 'white',
      },
      statusBar: {
        style: 'light',
      },
      layout: {
        orientation: ['portrait'],
      },
      bottomTabs: {
        titleDisplayMode: 'alwaysShow',
      },
      bottomTab: {
        textColor: 'gray',
        selectedTextColor: 'black',
        iconColor: 'gray',
        selectedIconColor: 'black',
      },
    })
  */
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: PLAY_DETAIL_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: skipAnimation ? {} : {
              sharedElementTransitions: [
                {
                  fromId: NAV_SHEAR_NATIVE_IDS.playDetail_pic,
                  toId: NAV_SHEAR_NATIVE_IDS.playDetail_pic,
                  interpolation: { type: 'spring' },
                },
              ],
              elementTransitions: [
                {
                  id: NAV_SHEAR_NATIVE_IDS.playDetail_header,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationY: {
                    from: -32, // Animate translationY from 16dp to 0dp
                    duration: 300,
                  },
                },
                {
                  id: NAV_SHEAR_NATIVE_IDS.playDetail_player,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationY: {
                    from: 32, // Animate translationY from 16dp to 0dp
                    duration: 300,
                  },
                },
              ],
              // content: {
              //   translationX: {
              //     from: windowSizeTools.getSize().width,
              //     to: 0,
              //     duration: 300,
              //   },
              // },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: windowSizeTools.getSize().width,
                  duration: 300,
                },
              },
            },
          },
        },
      },
    })
  })
}
export function pushSonglistDetailScreen(componentId: string, info: ListInfoItem) {
  if (shouldSkipPush(componentId, SONGLIST_DETAIL_SCREEN, { id: info.id })) return
  const theme = themeState.theme

  requestAnimationFrame(() => {
    void Navigation.push(componentId, {
      component: {
        name: SONGLIST_DETAIL_SCREEN,
        passProps: {
          info,
        },
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              sharedElementTransitions: [
                {
                  fromId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${info.id}`,
                  toId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_to_${info.id}`,
                  interpolation: { type: 'spring' },
                },
              ],
              elementTransitions: [
                {
                  id: NAV_SHEAR_NATIVE_IDS.songlistDetail_title,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationX: {
                    from: 16, // Animate translationX from 16dp to 0dp
                    duration: 300,
                  },
                },
              ],
              // content: {
              //   scaleX: {
              //     from: 1.2,
              //     to: 1,
              //     duration: 200,
              //   },
              //   scaleY: {
              //     from: 1.2,
              //     to: 1,
              //     duration: 200,
              //   },
              //   alpha: {
              //     from: 0,
              //     to: 1,
              //     duration: 200,
              //   },
              // },
            },
            pop: {
              sharedElementTransitions: [
                {
                  fromId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_to_${info.id}`,
                  toId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${info.id}`,
                  interpolation: { type: 'spring' },
                },
              ],
              elementTransitions: [
                {
                  id: NAV_SHEAR_NATIVE_IDS.songlistDetail_title,
                  alpha: {
                    to: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationX: {
                    to: 16, // Animate translationX from 16dp to 0dp
                    duration: 300,
                  },
                },
              ],
              // content: {
              //   alpha: {
              //     from: 1,
              //     to: 0,
              //     duration: 200,
              //   },
              // },
            },
          },
        },
      },
    })
  })
}
export function pushCommentScreen(componentId: string) {
  if (shouldSkipPush(componentId, COMMENT_SCREEN)) return
  /*
    Navigation.setDefaultOptions({
      topBar: {
        background: {
          color: '#039893',
        },
        title: {
          color: 'white',
        },
        backButton: {
          title: '', // Remove previous screen name from back button
          color: 'white',
        },
        buttonColor: 'white',
      },
      statusBar: {
        style: 'light',
      },
      layout: {
        orientation: ['portrait'],
      },
      bottomTabs: {
        titleDisplayMode: 'alwaysShow',
      },
      bottomTab: {
        textColor: 'gray',
        selectedTextColor: 'black',
        iconColor: 'gray',
        selectedIconColor: 'black',
      },
    })
  */
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: COMMENT_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              content: {
                translationX: {
                  from: windowSizeTools.getSize().width,
                  to: 0,
                  duration: 300,
                },
              },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: windowSizeTools.getSize().width,
                  duration: 300,
                },
              },
            },
          },
        },
      },
    })
  })
}

export function pushListenTogetherScreen(componentId: string) {
  if (shouldSkipPush(componentId, LISTEN_TOGETHER_SCREEN)) return
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: LISTEN_TOGETHER_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              content: {
                translationY: {
                  from: windowSizeTools.getSize().height,
                  to: 0,
                  duration: 280,
                },
              },
            },
            pop: {
              content: {
                translationY: {
                  from: 0,
                  to: windowSizeTools.getSize().height,
                  duration: 260,
                },
              },
            },
          },
        },
      },
    })
  })
}

// export function pushSettingScreen(componentId: string) {
//   /*
//     Navigation.setDefaultOptions({
//       topBar: {
//         background: {
//           color: '#039893',
//         },
//         title: {
//           color: 'white',
//         },
//         backButton: {
//           title: '', // Remove previous screen name from back button
//           color: 'white',
//         },
//         buttonColor: 'white',
//       },
//       statusBar: {
//         style: 'light',
//       },
//       layout: {
//         orientation: ['portrait'],
//       },
//       bottomTabs: {
//         titleDisplayMode: 'alwaysShow',
//       },
//       bottomTab: {
//         textColor: 'gray',
//         selectedTextColor: 'black',
//         iconColor: 'gray',
//         selectedIconColor: 'black',
//       },
//     })
//   */
//     const theme = themeState.theme

//     void Navigation.push(componentId, {
//       component: {
//         name: SETTING_SCREEN,
//         options: {
//           topBar: {
//             visible: false,
//             height: 0,
//             drawBehind: false,
//           },
//           statusBar: {
//             drawBehind: true,
//             visible: true,
//             style: getStatusBarStyle(theme.isDark),
//             backgroundColor: 'transparent',
//           },
//           navigationBar: {
//             // visible: false,
//             backgroundColor: theme['c-content-background'],
//           },
//           layout: {
//             componentBackgroundColor: theme['c-content-background'],
//           },
//           animations: {
//             push: {
//               content: {
//                 translationX: {
//                   from: windowSizeTools.getSize().width,
//                   to: 0,
//                   duration: 300,
//                 },
//               },
//             },
//             pop: {
//               content: {
//                 translationX: {
//                   from: 0,
//                   to: windowSizeTools.getSize().width,
//                   duration: 300,
//                 },
//               },
//             },
//           },
//         },
//       },
//   })
// }

/*
export function pushSingleScreenApp() {
  Navigation.setRoot({
    root: {
      stack: {
        children: [{
          component: {
            name: SINGLE_APP_SCREEN,
            options: {
              topBar: {
                title: {
                  text: 'SINGLE SCREEN APP',
                },
                leftButtons: [
                  {
                    id: 'nav_user_btn',
                    icon: require('assets/icons/ic_nav_user.png'),
                    color: 'white',
                  },
                ],
                rightButtons: [
                  {
                    id: 'nav_logout_btn',
                    icon: require('assets/icons/ic_nav_logout.png'),
                    color: 'white',
                  },
                ],
              },
            },
          },
        }],
      },
    },
  })
}

export function pushTabBasedApp() {
  Navigation.setRoot({
    root: {
      bottomTabs: {
        children: [{
          stack: {
            children: [{
              component: {
                name: TAB1_SCREEN,
                options: {
                  topBar: {
                    title: {
                      text: 'TAB 1',
                    },
                    leftButtons: [
                      {
                        id: 'nav_user_btn',
                        icon: require('assets/icons/ic_nav_user.png'),
                        color: 'white',
                      },
                    ],
                    rightButtons: [
                      {
                        id: 'nav_logout_btn',
                        icon: require('assets/icons/ic_nav_logout.png'),
                        color: 'white',
                      },
                    ],
                  },
                },
              },
            }],
            options: {
              bottomTab: {
                icon: require('assets/icons/ic_tab_home.png'),
                testID: 'FIRST_TAB_BAR_BUTTON',
                text: 'Tab1',
              },
            },
          },
        },
        {
          stack: {
            children: [{
              component: {
                name: TAB2_SCREEN,
                options: {
                  topBar: {
                    title: {
                      text: 'TAB 2',
                    },
                    leftButtons: [
                      {
                        id: 'nav_user_btn',
                        icon: require('assets/icons/ic_nav_user.png'),
                        color: 'white',
                      },
                    ],
                    rightButtons: [
                      {
                        id: 'nav_logout_btn',
                        icon: require('assets/icons/ic_nav_logout.png'),
                        color: 'white',
                      },
                    ],
                  },
                },
              },
            }],
            options: {
              bottomTab: {
                icon: require('assets/icons/ic_tab_menu.png'),
                testID: 'SECOND_TAB_BAR_BUTTON',
                text: 'Tab2',
              },
            },
          },
        }],
      },
    },
  })
}
 */

/** 通用全屏页面 push（百度网盘登录 / 目录选择用） */
const pushPlainScreen = (componentId: string, name: string) => {
  requestAnimationFrame(() => {
    const theme = themeState.theme
    void Navigation.push(componentId, {
      component: {
        name,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
        },
      },
    })
  })
}

export function pushBaiduPanLoginScreen(componentId: string) {
  pushPlainScreen(componentId, BAIDU_PAN_LOGIN_SCREEN)
}

export function pushBaiduPanDirScreen(componentId: string) {
  pushPlainScreen(componentId, BAIDU_PAN_DIR_SCREEN)
}

export function pushDownloadScreen(componentId: string) {
  if (shouldSkipPush(componentId, DOWNLOAD_SCREEN)) return
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: DOWNLOAD_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
        },
      },
    })
  })
}

export function pushLocalMusicScreen(componentId: string) {
  if (shouldSkipPush(componentId, LOCAL_MUSIC_SCREEN)) return
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: LOCAL_MUSIC_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              content: {
                translationX: {
                  from: windowSizeTools.getSize().width,
                  to: 0,
                  duration: 260,
                },
              },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: windowSizeTools.getSize().width,
                  duration: 240,
                },
              },
            },
          },
        },
      },
    })
  })
}


/**
 * 通用全屏页面（无原生顶栏，由页面自绘头部）
 */
function pushFullScreen(componentId: string, name: string, passProps?: Record<string, any>) {
  if (shouldSkipPush(componentId, name, passProps)) return
  requestAnimationFrame(() => {
    const theme = themeState.theme
    const width = windowSizeTools.getSize().width

    void Navigation.push(componentId, {
      component: {
        name,
        passProps,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              content: {
                translationX: {
                  from: width,
                  to: 0,
                  duration: 260,
                },
              },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: width,
                  duration: 240,
                },
              },
            },
          },
        },
      },
    })
  })
}

export function pushPlatformSettingScreen(componentId: string) {
  pushFullScreen(componentId, PLATFORM_SETTING_SCREEN)
}

export function pushDirectoryPickerScreen(componentId: string, initialPath?: string) {
  pushFullScreen(componentId, DIRECTORY_PICKER_SCREEN, { initialPath })
}

export function pushThemeManagerScreen(componentId: string) {
  pushFullScreen(componentId, THEME_MANAGER_SCREEN)
}

export function pushWebDAVScreen(componentId: string) {
  pushFullScreen(componentId, WEBDAV_SCREEN)
}


export function pushNeteaseMineScreen(componentId: string) {
  pushFullScreen(componentId, NETEASE_MINE_SCREEN)
}

export function pushDailyRecScreen(componentId: string) {
  pushFullScreen(componentId, NETEASE_DAILY_SCREEN)
}

export function pushFollowedArtistsScreen(componentId: string) {
  pushFullScreen(componentId, NETEASE_FOLLOWED_SCREEN)
}

export function pushCloudDiskScreen(componentId: string) {
  pushFullScreen(componentId, NETEASE_CLOUD_SCREEN)
}

export function pushLikedSongsScreen(componentId: string) {
  pushFullScreen(componentId, NETEASE_LIKED_SCREEN)
}

export function pushMyPlaylistsScreen(componentId: string, options?: { onlySubscribed?: boolean }) {
  pushFullScreen(componentId, NETEASE_PLAYLISTS_SCREEN, options)
}

export function pushArtistSongsScreen(componentId: string, artistId: string | number, artistName?: string) {
  pushFullScreen(componentId, NETEASE_ARTIST_SCREEN, { artistId, artistName })
}

export function pushNeteaseAlbumsScreen(componentId: string, mode: 'sub' | 'new' = 'sub') {
  pushFullScreen(componentId, NETEASE_ALBUMS_SCREEN, { mode })
}

export function pushAlbumSongsScreen(componentId: string, albumId: string | number, albumName?: string) {
  pushFullScreen(componentId, NETEASE_ALBUM_SONGS_SCREEN, { albumId, albumName })
}

export function pushPlatformListScreen(componentId: string, mode: 'tx-mine' | 'tx-fav' | 'tx-album' | 'tx-recommend' | 'kg-mine' | 'kg-fav' | 'kg-recommend') {
  pushFullScreen(componentId, PLATFORM_LIST_SCREEN, { mode })
}

export function pushPlatformSongsScreen(componentId: string, kind: 'tx-daily' | 'tx-liked' | 'tx-home' | 'tx-radar' | 'tx-new' | 'tx-guess' | 'kg-daily' | 'kg-liked' | 'kg-new' | 'wy-fm') {
  pushFullScreen(componentId, PLATFORM_SONGS_SCREEN, { kind })
}
