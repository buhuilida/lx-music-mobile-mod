# 二改功能说明

本仓库在 [lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 基础上做了二次开发。

> 二改：月下独酌　QQ：3139606844

## 功能一览

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 一起听 | 播放页「一起听」按钮 / 设置 → 其他 → 一起听 | 多人同房间同步播放，详见 [listen-together.md](./listen-together.md) |
| 歌曲下载 | 播放页顶栏下载图标 | 选择音质后下载到系统 `/storage/emulated/0/Download/` |
| 下载管理 | 首页侧边栏「下载」/ 设置 → 其他 → 我的下载 | 查看/播放/删除已下载歌曲 |
| 听歌播报 | 设置 → 播放 → 听歌播报 | 切歌时用系统 TTS 播报「正在播放 歌名，歌手」 |
| 系统歌词 | 设置 → 播放 → 系统歌词（锁屏 / 灵动岛） | 按 ColorOS / OPlus 的 `lyricInfo` 协议把整首歌词交给系统渲染 |
| 歌词灵动岛 | 设置 → 播放 → 歌词灵动岛 | 当前歌词 + 进度推到常驻通知，Android 16 起尝试提升为 Live Update |
| 一起听网页版 | 设置 → 其他 → 一起听 → 打开网页版 | 浏览器无需装 App 即可加入房间，可直接听到房主正在播放的音频，地址内置可改 |
| 自定义主题背景 | 设置 → 主题 → 自定义主题背景 | 从相册选图作为播放页背景，任何主题都可见（1.12.0 修复默认主题不显示） |
| 在线更新 | 设置 → 关于 → 检查更新 | 指向自建下载页，可直接下载新安装包；关于页有「二改版主页」入口 |
| 二改源码下载 | 下载页 download.html | 源码 zip 含一起听服务端，可自行部署 |

## 1. 歌曲下载与音质选择

- 播放页顶栏新增下载图标，点击弹出音质列表（标准 128k / 较高 192k / 高品质 320k / 无损 FLAC / Hi-Res / APE / WAV）。
- 音质列表优先取歌曲自身提供的音质（`musicInfo.meta._qualitys`），没有时给出 128k / 320k / flac 三档，实际下载由音源自动降级。
- 文件保存到系统下载目录 `/storage/emulated/0/Download/`，命名为 `歌名 - 歌手.扩展名`，同名文件自动加时间戳，文件管理器里直接可见。
- 写入系统 Download 前会检查存储权限（`WRITE_EXTERNAL_STORAGE`），首次下载时申请；用户拒绝则回退到 App 私有目录 `DocumentDir/download/` 并提示。
- 默认下载音质由设置项 `download.quality` 控制（当前 UI 里通过弹窗直选，设置项留作后续记忆上次选择用）。

相关代码：

| 路径 | 说明 |
| --- | --- |
| `src/core/download/index.ts` | 下载队列、进度、文件落盘、列表持久化 |
| `src/store/download/*` | 下载列表与进度状态、Hook |
| `src/screens/Download/index.tsx` | 下载管理页 |
| `src/screens/PlayDetail/components/DownloadBtn.tsx` | 播放页下载按钮 + 音质弹窗 |

## 2. 播放已缓存（已下载）的音乐

- 入口：**首页右上角菜单（侧边栏）→ 下载**，或 设置 → 其他 → 我的下载 → 打开下载管理。
- 列表里点任意一首即播放（转成本地歌曲信息后交给播放器），顶部「播放全部」从第一首开始。
- 下载完成后，歌曲记录在下载列表里，点击即可播放。
- 播放时会把下载项转换成 `LX.Music.MusicInfoLocal`（`source: 'local'`，`meta.filePath` 指向本地文件），复用项目已有的本地音乐播放链路；封面与歌词读不到时回退到在线搜索。
- App 启动时会校验下载列表里的文件是否还在，被系统清理掉的记录会自动剔除。

## 3. 听歌播报

- 切歌时调用 Android `TextToSpeech` 播报 `正在播放 {歌名}，{歌手}`。
- 暂停时主动打断播报，避免和下一首叠在一起。
- 语速由设置项 `player.songNotifyRate` 控制，默认 1.0。
- 依赖系统 TTS 引擎（大多数国行 ROM 自带讯飞/小爱等引擎）；没有可用引擎时静默失败，不影响播放。

## 4. 歌词灵动岛

先说结论：**Android 16 的 Live Updates 明确不面向音乐/音频类应用**，系统把这类展示留给媒体会话（MediaSession）。所以歌词上岛不能只靠「发一条常驻通知去申请提升」，主通道必须是媒体会话，常驻通知只是兜底。

两条通道同时工作：

1. **媒体会话通道（ColorOS 灵动岛/流体云的主通道）**
   - 每一句歌词播放时，通过 `updateNowPlayingTitles()` 更新 `MediaSession` 元数据：`title = 当前歌词`、`artist = 歌名 - 歌手`。
   - ColorOS 的音乐岛/胶囊读取的就是这两个字段（对比参考机型上的网易云：标题是歌词、副标题是「歌名 - 歌手」），因此岛上的胶囊与展开卡片会直接显示当前一句。
   - 歌词来源改为 `onLyricLinePlay`（桌面歌词用的同一个回调），不再自己解析 LRC，避免歌词字段缺失时整条链路静默失效。
   - 若用户已开启「蓝牙歌词」，该通道让位给原逻辑，避免互相覆盖；关闭本功能会把标题恢复成歌名。

2. **常驻通知通道（低版本兜底）**
   - 发一条 `ongoing` 通知，带歌名、当前歌词、播放进度；展开显示整段歌词。
   - 为满足 Live Update 的硬性条件所做的调整：
     - Manifest 增加 `android.permission.POST_PROMOTED_NOTIFICATIONS`（缺这个权限会被系统静默拒绝提升，且不报错）。
     - 通知渠道从 `IMPORTANCE_LOW` 改为 `IMPORTANCE_DEFAULT`（`LOW` 会让通知失去提升资格），渠道 id 升级为 `lx_lyric_island_v2` 以让旧安装重建渠道。
     - 通过反射调用 `setRequestPromotedOngoing(true)` 与 `setShortCriticalText(...)`（状态栏胶囊短文案，缺了也不会提升）。
     - 不使用自定义 RemoteViews、不 setColorized，样式为 BigTextStyle + 进度条，符合系统要求。

3. **系统歌词通道（推荐，ColorOS 16/17 原生链路）**
   - 参照 [ColorOS-Live-Lyrics-Bridge](https://github.com/Andrea-lyz/ColorOS-Live-Lyrics-Bridge) 的 `LyricInfoContract`：ColorOS / OPlus 的 SystemUI 会读取当前 `MediaSession` 的 `MediaMetadata["lyricInfo"]`，字段是一段 JSON（`songName` / `artist` / `album` / `songId` / `lyric` / `translationLyric` / `trackKey` / `sessionGeneration` / `provider`）。
   - `src/core/player/systemLyric.ts` 把带时间轴的 LRC 全文（含翻译）按同一份契约推给系统，锁屏、AOD 与灵动岛由系统自己滚动、高亮，不再需要逐句改写标题。
   - 实现方式：给 `react-native-track-player` 的 `MetadataManager` 打补丁（`dependencies-patch.js`），`updateTitles` 支持 `lyricInfo` 键并缓存，切歌重建 metadata 时自动补回；`lyricInfo` 为空字符串即从 extras 中移除，避免串歌。
   - 该通道开启时**不再**把歌词写进标题——标题被歌词覆盖会打断系统的曲目匹配。

> 现实情况：本包 `targetSdk = 29`，而 Live Update 只对 `targetSdk 36` 的应用生效；再加上前面说的「音乐类不适用」，所以国产 ROM 上能否上岛最终取决于系统是否把**媒体会话**做成岛。若胶囊只显示歌名：先确认「系统歌词」与「歌词灵动岛」都开着，并关闭系统里的「蓝牙歌词 / 车载歌词」（它会持续把标题改成歌名），再检查系统是否给本应用开了「实时活动 / 灵动岛」权限。

## 4.1 一起听网页版（公网域名 + 内置地址）

- 服务端 `listen-together-server` 已发布到公网：`https://af384ee6deb6e09e2.app.workbuddy.host/?sharecode=MKPWEVLBUS`，同一个域名就是 WebSocket 地址（`wss://af384ee6deb6e09e2.app.workbuddy.host?sharecode=MKPWEVLBUS`）。
- 网页版无需构建，手机浏览器直接打开就能建房间 / 加入 / 看进度 / 聊天；页面支持 `?server=wss://...` 指定其它中继，也支持 `?sharecode=` 访问凭据（会自动带到 WebSocket 上）。
- **网页能直接听到房主的歌**：房主广播播放状态时会附带当前歌曲的音频直链（`music.url`，5 分钟缓存、取不到则为 `null`），网页用 `<audio>` 直接向音源取流，服务端不中转音频。切歌、暂停、进度、倍速都会跟随；浏览器要求一次点击才出声，所以首次点「同步收听」，之后自动跟随。本地文件或音源限制外链时降级为「仅同步进度」并提示用 App 听。
- App 内已内置上述地址：`listenTogether.serverUrl`（WebSocket）与 `listenTogether.webUrl`（网页版），设置 → 其他 → 一起听 里可以随时改成自建服务；「打开网页版」按钮用系统浏览器打开。
- 旧版本里内置的 `*.lhr.life` 临时隧道地址会在启动时自动迁移到新地址。

## 5. 自定义主题背景

- 设置 → 主题 → 自定义主题背景 → 选择图片，调起系统相册。
- 图片会被复制到 App 私有目录 `files/custom_bg/`（避免 `content://` 授权过期），路径存入设置项 `theme.customBgImage`。
- 自定义背景优先级最高：会覆盖主题自带的背景图，**也会覆盖「使用动态背景」（封面模糊）**——之前默认主题下不生效，就是动态背景把背景位抢走了。
- 清除后恢复主题默认背景 / 动态背景。

## 5.1 桌面歌词悬浮窗不再挡住界面

桌面歌词是系统级悬浮窗，默认只有「锁定」状态才穿透点击；未锁定时它会拦截整条区域的触摸，表现为「设置页被一块半透明面板盖住，点哪里都没反应」。

现在改为：**切回 LX Music 前台时自动隐藏桌面歌词，切到后台/别的 App 时自动恢复**。这样既保留了「看别的 App 时看歌词」的用途，也不会再挡住 App 自己的界面。

相关代码：`src/core/init/player/lyric.ts` 中的 `AppState` 监听。

## 5.2 侧边栏抽屉「只剩一层黑遮罩、点什么都不动」的修复

现象：打开过「一起听」或「下载」这类新页面再返回首页后，点左上角三条杠，整页变暗、抽屉不出现，点哪里都没反应。

原因：首页侧边栏用的是原生 `DrawerLayoutAndroid`，它在「导航到其它屏幕再返回」后会丢失抽屉宽度/位移，`openDrawer()` 只画出遮罩而抽屉本体停在屏幕外。上游的做法是靠 `componentIds` 变化触发一次重新布局来修复，但新加的两个页面没有注册 `componentId`，所以返回首页后修复逻辑永远不触发。

修复：

| 改动 | 位置 |
| --- | --- |
| 一起听 / 下载页注册 `COMPONENT_IDS.listenTogether` / `COMPONENT_IDS.download` | `src/screens/ListenTogether/index.tsx`、`src/screens/Download/index.tsx` |
| 抽屉监听首页 `componentDidAppear`，返回首页后第一次打开抽屉前强制重新布局一帧 | `src/components/common/DrawerLayoutFixed.tsx` |
| 首页 `componentDidDisappear` 时收起抽屉，避免遮罩留在上层 | 同上 |
| 抽屉宽度改为按窗口宽度初始化，不再依赖首次 `onLayout`（避免宽度为 0 时抽屉不可见） | 同上 |

覆盖到的页面：一起听、下载、播放页、歌单详情、评论页（后三者本来就注册了 `componentId`），以及排行榜/我的列表/歌单页里的二级抽屉。

## 5.3 一起听页面「一片黑、看不清房间号」的修复

现象：房间页的卡片变成一整块深灰，房间码、歌名、按钮文字几乎看不见，换成自定义背景图后更明显。

原因有两层，都是配色取值用错：

| 位置 | 错误写法 | 实际效果 |
| --- | --- | --- |
| 卡片背景 | `c-primary-alpha-100` | 这个键是**主色 90% 不透明**，不是「很淡的主色」。主色偏深（如「近墨者黑」主题 `rgb(47,47,47)`）时整块卡片就是深灰，而文字仍是主题字体色，对比度只有 1.03 |
| 复制 / 发送按钮 | 主色 50% 底 + `c-primary-font` 字 | 字色就是主色本身，底色也是主色，等于同色印同色 |
| 播放页「一起听」入口 | 同上 | 顶栏上只看到一个深色小块 |

修复：

- 所有卡片改用「主色最亮/最暗档 + 80% 不透明」的蒙层色（`c-primary-light-1000-alpha-200`）：浅色主题下是白色蒙层、深色主题下是近黑蒙层，字体色天然与之反色，同时保留自定义背景图的质感。
- 房间成员、聊天、快捷语改为胶囊/气泡，按钮统一用 `c-button-background` + `c-button-font`（LX 全局按钮配色），不再出现同色文字。
- 「房间成员」「聊天」从图片上移到卡片内，标题改用 `c-font` 加粗；房间码字号加大并加粗；正在播放卡片补上封面。
- 头部（标题 / 退出）也加同款蒙层，避免叠在浅色背景图上发虚。

验证脚本 `scripts/check-contrast.js`：

- 遍历 16 个内置主题，按 WCAG 公式计算卡片文字对比度（对纯白、纯黑两种极端背景取最差值）。
- 旧写法 **16/16 全部低于 4.5**（最低 1.03，正是「近墨者黑」）；新写法 **16/16 全部 ≥ 4.5**。
- 同时静态扫描 `src` 下把 `c-primary-alpha-100/200/300` 当背景的写法，防止回退。

## 5.4 自定义主题背景「选了没反应」的修复（1.12.0）

**根因**：默认主题（绿意盎然、蓝田生玉等）的 `c-main-background` 是 `rgba(255,255,255,1)` 这种**完全不透明**的颜色，它作为整页主背景叠在背景图层上面，把自定义图片整块盖住了。内置带图主题（近墨者黑等）之所以正常，是因为它们本来就写了 0.8~0.95 的半透明。

**修复**（`src/theme/themes/index.ts`）：

- `buildActiveThemeColors()` 在检测到背景图（自定义图片或主题自带图）时，把 `c-main-background` 统一改写为 0.72（浅色）/ 0.78（深色）透明度的蒙层；
- 浅色主题的辅助文字 `c-font-label` 在有背景图时改用更深的 `c-650`，保证图片上仍可读；
- 顺带修复了自定义主题（`isCustom`）里 `bg-image` 填文件名时不会生成图片源的问题。

校验脚本 `scripts/check-bg.js`：模拟背景图为中灰 / 纯白 / 纯黑三种极端照片，计算 16 个主题主字体与辅助文字的 WCAG 对比度，全部通过。

## 5.5 1.13.0 修复与增强

### 自定义主题背景真正修好（根因）

- `c-main-background` 定义在主题的 **extInfo** 里，而 `buildActiveThemeColors()` 返回对象时 `...extInfo` 在 `...themeColors` 之后展开，之前把半透明值写进 `themeColors` 会被 extInfo 的不透明色覆盖——所以只有内置带图主题（近墨者黑等后 5 个）能看到背景。
- 现在直接写回 `theme.config.extInfo['c-main-background']`（0.72 浅色 / 0.78 深色蒙层），所有 16 个主题都能透出自定义背景图。

### 动态背景

- 「使用动态背景」开启后，当前歌曲封面（模糊）作为背景，优先级高于自定义背景图；关闭或无封面时回退主题背景。

### 一起听：成员播放源（网页建房互通）

- 服务端为房间增加 `stateSourceId`：房主权威不变；**房间空闲时成员可成为播放源**（网页建房、App 加入后播放的典型场景），其它端（网页/其它 App）跟随歌曲、进度、歌词与音频直链。
- 播放源不能被抢占：只有房主播放后才能收回；播放源退出时房间状态清空，其他人回到等待。
- 成员的播放控制指令转给当前播放源执行；歌词允许房主或播放源推送。
- 测试：`listen-together-server/test/test.js` 新增 6 项播放源用例，共 23 项全过。

## 5.6 1.13.1 修复：成员切歌后房间不同步

**现象**：网页建房、App 加入后，App 播第一首歌时网页能跟上；App 切换音乐后网页的歌曲信息、音频、歌词全部停留在旧歌。

**根因**：服务端广播播放状态时会排除发送者本人（`broadcast(..., exceptId)`），App 广播成功成为播放源后**收不到任何「你已是播放源」的确认**，本地 `playbackSourceId` 一直是空。下一首歌触发 `handleMusicChanged` 时 `canBroadcast()` 判定为否（此时 `ltState.playback` 已非空、`playbackSourceId` 又不等于自己），歌曲状态不再广播，反而走成员控制分支给网页房主发了 play/pause。

**修复**：

- App 端（`playerSync.ts`）：`broadcastState()` 发送成功后直接认领播放源身份（`setPlaybackSource(selfId)`），歌词推送（`lyricSync.ts` 同条件）随之恢复。
- 服务端（`index.js`）：`state` / `lyric` 广播不再排除发送者，播放源本人也收到带自己 `sourceId` 的回显，多端身份一致；客户端对来自自己的消息只更新播放源标记、不重复应用。
- 测试：`test/test.js` 增加「发送者收到自身回显」断言，23 项全过；网页端到端 13 项全过。

## 6. 原生扩展模块

新增 `cn.toside.music.mobile.ext` 包，包含：

| 能力 | JS 封装 |
| --- | --- |
| `pickImage` 相册选图 | `src/utils/nativeExt.ts` |
| `speak` / `stopSpeak` 语音播报 | 同上 |
| `showIsland` / `hideIsland` 灵动岛通知 | 同上 |

iOS 端未实现对应模块，`nativeExt.ts` 会自动降级为空操作，不影响其它功能。

## 7. 安装包与签名

本仓库已生成正式签名并打包出 Release APK：

| 项目 | 值 |
| --- | --- |
| 包名 | `cn.toside.music.mobile` |
| 版本 | 1.13.1（versionCode 94003） |
| 签名证书 | `android/app/lxmusic-release.keystore` |
| 别名 / 密码 | `lxmusic` / `lxmusic2024`（store 与 key 同密码） |
| 证书 DN | `CN=YueXiaDuZhuo, OU=LXMusicMod, O=Personal, L=Beijing, ST=Beijing, C=CN` |
| SHA-256 指纹 | `29:02:43:CE:61:9A:75:D5:1D:B1:5C:F0:80:D2:45:93:32:B0:8E:4F:92:8D:83:29:1A:48:39:6F:82:B6:31:72` |

签名配置在 `android/app/build.gradle` 的 `signingConfigs.release`，从 `android/keystore.properties` 读取（该文件与 keystore 不入库，需自行备份，**丢失后无法覆盖升级安装**）。

重新打包：

```bash
cd android
export JAVA_HOME=/path/to/jdk17
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# 产物：android/app/build/outputs/apk/release/
```

- `arm64-v8a`：14 MB，覆盖 2016 年之后绝大多数手机，推荐分发。
- `universal`：28 MB，含 arm64-v8a / armeabi-v7a / x86 / x86_64，兼容老旧 32 位设备与模拟器。

## 7.1 本次（1.12.0）的验证记录

| 验证项 | 方式 | 结果 |
| --- | --- | --- |
| 服务端：音质字段 / 歌词推送 / 后加入者补发歌词 / 成员控制中继 / 非法指令拒绝 | `node listen-together-server/test/test.js` | 16 项全过 |
| 网页版：同步歌词当前句、音质角标、聊天、进度、HTTP 接口 | `node listen-together-server/test/web.test.js`（无头 Chrome） | 13 项全过，无 JS 报错 |
| 自定义背景蒙层可读性（16 主题 × 3 种极端照片） | `node scripts/check-bg.js` | 全部通过 |
| 屏幕注册 / 对比度回归 | `node scripts/check-screens.js`、`node scripts/check-contrast.js` | 5/5 与 16/16 通过 |
| 类型检查 / 代码规范 | `npx tsc --noEmit`、`npx eslint <改动文件>` | 无新增错误 |
| APK 签名 | `apksigner verify --print-certs` | 与 1.11.0 同一证书（SHA-256 2902…3172），可覆盖升级 |
| 公网下载页 / 版本信息 / 安装包 / 源码包 | `curl -I`（带 sharecode） | `200`，APK 13.9MB、源码 4.4MB，MIME 正确 |
| 包内容抽查 | `unzip -p … index.android.bundle` | 含歌词同步 / 房间音质 / 内置更新地址等关键串 |

## 7.2 上一版（1.11.0）的验证记录

| 验证项 | 方式 | 结果 |
| --- | --- | --- |
| 16 个内置主题的卡片文字对比度 | `node scripts/check-contrast.js` | 旧写法 16/16 不合格（最低 1.03），新写法 16/16 ≥ 4.5 |
| 网页版音频同步（播放/暂停/切歌/进度对齐/无直链降级） | 无头 Chrome + 本地 `wav` 直链，`audio.test.js` | 10 项全过，无 JS 报错 |
| 静态服务 Range 请求 | `curl -H 'Range: bytes=100-199'` | `206` + `Content-Range`，音频可拖动 |
| 服务端协议回归 | `node test/test.js` | 12 项全过 |
| 网页版功能回归（本地 + 公网域名） | `node test/web.test.js`、公网 sharecode 版本 | 12 项全过 |
| 公网服务已更新 | `curl https://af384ee6deb6e09e2.app.workbuddy.host/health?sharecode=...` | `{"ok":true}`，页面含音频控件 |
| 类型检查 / 代码规范 | `npx tsc --noEmit`、`npx eslint <改动文件>` | 新增文件无新增错误 |
| APK 签名 | `apksigner verify --print-certs` | 与 1.10.0 同一证书，可覆盖升级 |

## 7.3 上一版（1.10.0）的验证记录

| 验证项 | 方式 | 结果 |
| --- | --- | --- |
| 服务端协议（建房/加入/状态/聊天/转交房主/断线重连/密码房/心跳） | `node listen-together-server/test/test.js` | 12 项全过 |
| 公网网页版（真实域名，含 sharecode） | `PAGE=https://af384ee6deb6e09e2.app.workbuddy.host/?sharecode=... node test/web.test.js`（无头 Chrome） | 12 项全过，无 JS 报错 |
| 公网 WebSocket 建房 | `wss://af384ee6deb6e09e2.app.workbuddy.host?sharecode=...` + `ws` 客户端 | 建房成功，房间码正常 |
| 所有被 push 的屏幕是否都注册 componentId | `node scripts/check-screens.js` | 5/5 通过 |
| 类型检查 | `npx tsc --noEmit` | 新增/修改文件无新增错误 |
| 代码规范 | `npx eslint <改动文件>` | 通过 |
| APK 签名 | `apksigner verify --print-certs` | 与 1.9.2 同一证书，可覆盖升级 |
| 包内容抽查 | `strings assets/index.android.bundle` + `strings classes.dex` | 含 `lyricInfo` / `sessionGeneration` / `translationLyric` / `lx_write_test` / 内置域名 |

> 沙箱内没有 KVM，无法跑模拟器，所以「抽屉遮罩」「下载落到系统 Download」「歌词上岛」这三项的真机表现仍需你在手机上确认。

## 8. 已知限制

- 下载依赖音源返回的直链，部分音源有防盗链或短时效，下载可能失败并提示错误。
- 下载只保存音频文件，不写入 ID3 标签（歌名/歌手/封面），文件管理器里看到的可能是原始文件名之外的空白标签。
- 灵动岛歌词在 Android 16 以下只是普通通知；系统开启省电限制后通知可能被折叠。
- 系统歌词（`lyricInfo`）能否显示取决于系统是否实现了 OPlus 原生歌词链路，纯原生 Android 只会忽略这个字段。
- 写入系统 Download 目录需要存储权限；被拒绝时走私有目录，卸载 App 会一并删除。
- 播报在蓝牙耳机/车机上是否走 A2DP 由系统决定。
- 网页版播放依赖音源直链：部分音源限制外链、链接有时效，或房主播的是本地文件时，网页端只能同步进度，声音需要在 App 里听。
- 网页版音频是「各设备各自拉流」，不是服务端推流，所以不同设备的起播时间会有几百毫秒差异（进度会持续校正）。
- 房间统一音质只影响成员**下一次取链接**（切歌 / 重新播放），已经播到一半的歌不会自动重载。
- 成员控制播放（拖进度 / 暂停）由房主代为执行，成员本地和房主版本时长不一致时以房主为准。

## 5.7 1.14.0 新增功能

### WebDAV 备份（设置 → 数据同步）

- 位置：设置页「数据同步」区块新增 WebDAV 子区块，支持坚果云、InfiniCloud、Alist 等任意标准 WebDAV 服务。
- 备份内容：全部歌单（默认列表 / 我的收藏 / 自建歌单）、全部设置、自定义源脚本；保存到云端 `lx-music-mod-sync/` 目录（`backup.json` + `meta.json`）。
- 核心实现：`src/core/sync/webdav.ts`（MKCOL / PUT / GET / PROPFIND 极简客户端，Basic 认证）、`src/core/sync/webdavBackup.ts`（备份收集与恢复，恢复时跳过本地专属键如主题背景图路径与 WebDAV 配置本身）。
- 界面：`settings/Sync/WebDAV.tsx`，含测试连接、备份到云端、查看云端备份（时间 + 数量）、从云端恢复（带覆盖确认）。

### 小米背屏 / iQOO 原子随身听兼容版（backscreen 变体）

- 小米背屏、iQOO 原子随身听等按「包名白名单」渲染通知与歌词，新增 gradle 产品变体 `backscreen`：applicationId 为 `com.luna.music`（汽水音乐），应用名同步显示「汽水音乐」，进入厂商白名单。
- 与 standard 变体同签名，可正常覆盖升级；与正版汽水音乐互相覆盖、不能共存；与 standard 版（`cn.toside.music.mobile`）可共存。
- 构建：`./gradlew assembleStandardRelease assembleBackscreenRelease`。

### 一起听入口加入侧边栏

- `src/config/constant.ts` 的 `NAV_MENUS` 新增 `nav_listen`（share 图标），`DrawerNav.tsx` 点击后直接进入一起听页面；三种语言文案同步。

### 源码仓库

- App 源码：https://github.com/yzdz666/lx-music-mobile-mod
- 一起听服务端 / 网页版：https://github.com/yzdz666/listen-together-server
- 设置 → 关于 新增两个仓库链接（`About.tsx`）。

## 5.8 1.15.0 新增功能（移植自 LX-X Music）

来源项目：[WalnutBai/lx-lxwalnut-music-mobile](https://github.com/WalnutBai/lx-lxwalnut-music-mobile)（关于页已列出致谢）。

### 播放失败本地缓存兜底

- 播放设置新增「播放失败使用本地缓存兜底」（默认开启，`player.failureFallback`）。
- 在线获取播放地址整链失败（重试 + 换源耗尽）时，自动在下载列表中查找同一首歌（按 musicInfo.id），文件存在则直接以 `file://` 播放并 toast 提示。
- 实现：`src/core/player/player.ts` 的 `setMusicUrl` catch 分支，复用 `findDownload`。

### 播放页音质徽标

- 播放详情页进度条上方显示当前实际播放音质与音源（如 `320K · KW`、`FLAC · WY`、`本地`），换源后自动更新。
- 新增 store `src/store/playingInfo/`（quality/source + state_event 事件 `playingInfoUpdated`）；记录点：`core/music/online.ts`（在线 + 换源成功）、`core/music/local.ts`（本地文件/换源）、`core/player/player.ts`（切歌清空、本地兜底）。
- UI：`PlayDetail/Vertical/Player/components/PlayInfo.tsx` 的 `QualityBadge`。

### 播放页屏幕常亮

- 播放设置新增「播放页屏幕常亮」（`player.keepScreenOn`，默认关）；开启后竖屏播放页整页常亮（原版仅歌词页常亮）。实现：`PlayDetail/Vertical/index.tsx` 的 `shouldKeepAwake()`。

### 背景不透明度 / 模糊度调节

- 设置 → 主题新增两组滑块：蒙层不透明度（30%~100%，`theme.customBgOpacity`，默认 75%）、背景模糊度（0~10，`theme.customBgBlur`，默认 0）。
- 蒙层不透明度在 `theme/themes/index.ts` 构建主题时应用（替代原 0.72/0.78 硬编码）；模糊度在 `components/PageContent.tsx` 的 ImageBackground `blurRadius` 应用（同时作用于自定义背景与动态背景）。UI：`settings/Theme/CustomBgAdjust.tsx`。

### WebDAV 自动备份

- 数据同步 → WebDAV 新增频率选择：关闭 / 每次启动 / 每天一次 / 每周一次（`sync.webdavAuto`）。
- 启动时（已同意协议）静默检查上次备份时间，到期且有配置则自动备份并 toast，失败静默。实现：`src/core/sync/webdavAuto.ts`，挂载于 `core/init/index.ts`。

### 关于页：引用项目与赞赏码

- 「引用项目 / 致谢」：原版 lyswhut/lx-music-mobile、LX-X Music（WalnutBai），点击跳转 GitHub。
- 「赞赏支持」：弹出赞赏码（`src/resources/images/sponsor.png`，Modal 展示）。

## 5.9 1.16.0 新增功能

### 音效系统（原生 android.media.audiofx）

- 新原生模块 `cn.toside.music.mobile.audioeffect`：Equalizer（多段均衡）+ BassBoost（低音增强）+ Virtualizer（环绕声场/立体声扩展，双扬声器完整利用）+ PresetReverb（混响），全局输出混音（audioSession 0），需 `MODIFY_AUDIO_SETTINGS` 权限。
- 设置 → 播放 → 「音效」：预设（全景环绕 / 电影院 / 音乐厅 / 低音增强）一键应用，或「自定义」逐项调节低音强度、环绕强度、混响空间与各频段均衡器。设置项 `player.audioEffectPreset/Bass/Virtualizer/Reverb/Eq`，应用逻辑 `src/core/audioEffect.ts`。

### 音源测试

- 设置 → 播放 → 「音源测试」：按平台（酷我/酷狗/QQ/网易/咪咕）输入关键词，逐档（128k→192k→320k→flac→flac24bit）实测播放地址可用性，显示实际最高可用音质与 [OK]/[FAIL]。实现 `src/core/musicSourceTest.ts` + `settings/Player/SourceTest.tsx`。

### 本地音乐扫描

- 设置 → 其他 → 「扫描本地音乐」：递归扫描 `/storage/emulated/0/Music`、`Download` 目录音频（mp3/flac/wav/ape/m4a/ogg/aac/wma/opus），按「歌名 - 歌手」解析命名，写入固定歌单「本地音乐」（`userlist_local_music`），列表内可直接播放。实现 `src/core/localMusic.ts`。

### 逐字歌词动画

- `src/utils/wordLyric.ts` 解析 lxlyric（洛雪逐字格式 `<start,dur>`）与 A2 增强 LRC（`<mm:ss.xxx>`）。
- `components/common/WordLyricText.tsx`：当前行逐字卡拉OK高亮（progress 事件 + rAF 本地插值驱动，暂停/seek 自动重置）。
- 歌词页（横竖屏）当前行有逐字数据时用逐字渲染，否则回退整行。数据链路：`playerState.musicInfo.lxlrc`（已有）→ `plugins/lyric.ts` `setLyric` 第四参 → `useWordLyricLines`。

### 下载设置

- 设置页新增「下载设置」区块：文件命名格式（歌名-歌手 / 歌手-歌名 / 歌名）、下载同时保存同名 .lrc 歌词文件。

### WebDAV 修复（Cloudreve 兼容）

- `webdav.ts`：PROPFIND 显式 `Depth: 0`；测试连接 GET 回退时把「目录 GET 405」视为认证通过（Cloudreve 特性）；统一 25 秒请求超时（AbortController）；错误信息更明确。已用 https://pan.cdn.ad/dav 实测 PROPFIND 207 / MKCOL 201 / PUT 201 / GET 302 全链路通过。

### 锁屏歌词

- 系统歌词（`player.systemLyric`，MediaSession 通知 + ColorOS lyricInfo 协议）锁屏直接显示当前歌词行，默认开启。

### 限制说明

- 网页版歌词当前为行级渲染（逐字需网页渲染器大改，未实现）；桌面歌词逐字已在 1.17.0 实现。
- 聚合平台账号页（网易/QQ/酷狗登录、云盘、小爱音箱）依赖平台私有协议，未移植。
- 源码包与 GitHub 仓库均不含正式签名密钥（`*.keystore` / `keystore.properties` 已排除，仅保留 debug.keystore）。

## 5.10 1.17.0 修复与增强

### 逐字歌词修复（App 内裸显标签）

- 根因：部分音源返回的歌词本身就是逐字格式（如 `<0,200>我<200,232>的`），但按普通 LRC 渲染，标签裸显。
- 修复：`utils/wordLyric.ts` 重写解析——支持洛雪 `<开始相对行首ms,持续ms>`（含绝对毫秒自动识别）与 A2 `<mm:ss.xx[,dur]>` 两种格式、标签在字前/字后两种顺序；新增 `hasWordTags / stripWordTags`，逐字歌词先剥标签再渲染；逐字源为空时自动回退用带标签的歌词本体解析。
- `core/lyric.ts` 统一处理：App 歌词页、桌面歌词、锁屏、蓝牙歌词、一起听推流拿到的都是干净文本。

### 桌面歌词逐字卡拉OK（原生）

- 原生链路：`LyricModule.setLyricWithWords(4参)` → `Lyric.setLyric` → `LyricPlayer.setLyric(lyric, extended, wordLyric)` 解析逐字标签并按行时间挂载 words（charStart/charEnd/startMs/endMs），逐字文本与行文本不一致时放弃该行卡拉OK（防错位）。
- 渲染：`LyricTextView` 卡拉OK模式——先画未唱颜色（unplayColor），按播放时钟（`LyricPlayer.getCurrentTime()`，33ms 帧率）裁剪叠加已唱颜色（playedColor）；支持滚动长行。
- `LyricSwitchView` 透传到当前 LyricTextView；`LyricView` 恢复/重建时保持时钟与数据。

### 锁屏歌词兜底

- 部分机型锁屏媒体卡片不消费 lyricInfo：`publishSystemLyricLine` 在当前行变化时把歌词行写入 MediaSession artist 字段（与主流音乐 App 一致），切歌/停播时恢复歌手名。`player.systemLyric` 默认开启。

### 侧边栏本地音乐

- 侧边栏新增「本地音乐」：点击后切到「我的列表」视图并自动选中 `userlist_local_music` 歌单（`core/localMusic.ts` 的 `LOCAL_LIST_ID`）。

### Master 音质

- `LX.Quality` 新增 `master`；`TRY_QUALITYS_LIST` 前置 master（播放/试听优先级 Master → Hi-Res → FLAC → 320K）；播放音质设置 UI、下载扩展名（master → flac）、音源测试档位、播放页音质徽标同步支持。

### WebDAV 复验

- pan.cdn.ad（Cloudreve）全链路实测：PROPFIND 207 / MKCOL 201 / PUT 201 / GET 200 / DELETE 204。
