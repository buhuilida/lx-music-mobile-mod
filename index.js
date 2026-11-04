/**
 * @format
 */
import './shim'
// 必须在任何播放器 / 歌词库加载前执行：改写原生模块的数值参数入口
import './src/utils/nativeArgGuard'
import './src/app'
// import './test'
// import '@/utils/errorHandle'
// import { Navigation } from 'react-native-navigation'
// import App from './App'

// Navigation.registerComponent('com.myApp.WelcomeScreen', () => App)
// Navigation.events().registerAppLaunchedListener(() => {
//   Navigation.setRoot({
//     root: {
//       stack: {
//         children: [
//           {
//             component: {
//               name: 'com.myApp.WelcomeScreen',
//             },
//           },
//         ],
//       },
//     },
//   })
// })
