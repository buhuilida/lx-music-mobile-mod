<p align="center">
  <img width="120" src="https://github.com/lyswhut/lx-music-mobile/raw/master/doc/images/icon.png" alt="LX Mod logo">
</p>

<h1 align="center">LX Mod</h1>

<p align="center">
  <a href="https://github.com/yzdz666/lx-music-mobile-mod/releases"><img src="https://img.shields.io/github/v/release/yzdz666/lx-music-mobile-mod?label=release" alt="Release"></a>
  <a href="https://github.com/yzdz666/lx-music-mobile-mod/releases"><img src="https://img.shields.io/github/downloads/yzdz666/lx-music-mobile-mod/total" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/Android-5.0%2B-3ddc84" alt="Android">
  <img src="https://img.shields.io/badge/package-com.lxmod.music-blue" alt="Package">
</p>

<p align="center">基于 React Native 的音乐播放器 · 洛雪音乐移动版二改</p>

---

## 这是什么

**LX Mod** 是 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile)（洛雪音乐移动版）的二次开发版本，在保留原有播放、歌单、音源机制的基础上，补齐了一批日常使用中缺席的能力。

- **应用名称**：LX Mod（桌面与系统设置里显示）
- **应用包名**：`com.lxmod.music`（与原版洛雪 **可共存安装**）
- **当前版本**：1.22.34（versionCode 139000）
- **作者**：月下独酌 · QQ 3139606844

## 下载

所有安装包与源码见 [Releases](https://github.com/yzdz666/lx-music-mobile-mod/releases)。

| 文件 | 适用场景 |
| --- | --- |
| `lxmod-v1.22.34-arm64-v8a.apk` | 新包名常规版，绝大多数手机（可与原版共存） |
| `lxmod-v1.22.34-universal.apk` | 新包名全架构版，不知道选哪个就选它 |
| `lxmod-v1.22.34-backscreen-arm64-v8a.apk` | 新包名 + 锁屏歌词增强（小米背屏 / 原子随身听） |
| `lxmod-origpkg-v1.22.34-arm64-v8a.apk` | **原包名** `cn.toside.music.mobile`，用于从旧版覆盖升级（保留数据，不能与原版共存） |
| `lxmod-origpkg-v1.22.34-universal.apk` | 原包名全架构版 |
| `lx-music-mod-src-v1.22.34.zip` | 源码（不含签名密钥） |

> 安装包文件名前缀沿用 `lxmod`（构建产物名），安装到手机后应用显示为 **LX Mod**。

> 从旧版（1.22.20 ~ 1.22.32）升级：想保留数据就用 `lxmod-origpkg-*`；想和原版洛雪并存就用 `lxmod-*`（两者数据不互通，需重新登录）。

## 功能

### 播放与音质

- **音质档位**：128K 标准 / 320K 高品质 / FLAC 无损 / 24bit 无损 / Hi-Res 无损 / 臻品全景声 Atmos / Atmos+ / 臻品母带 Master，播放与下载共用同一套中文名称
- **音质徽标**：播放页实时显示「实际播放音质 · 音源」，母带 / 全景声不再被音源声明拦截
- **下载**：可选 8 档音质，选到不支持的档位自动按回退链降级，文件按实际音质命名
- **播放页常亮**、背景不透明度 / 模糊调节、播放失败本地缓存兜底

### 一起听

- App 内多人同房间同步播放，房主控进度，成员实时跟随
- **一起听网页版**：浏览器无需装 App 即可加入房间，直接听到房主正在播放的音频，音质徽标、歌词、进度全同步
- 服务端另见 [yzdz666/listen-together-server](https://github.com/yzdz666/listen-together-server)，可自行部署

### 歌词

- 系统歌词（锁屏 / ColorOS、OPlus `lyricInfo` 协议）
- 歌词灵动岛：当前歌词 + 进度推到常驻通知，Android 16 起尝试 Live Update
- App 内逐字歌词渲染、桌面歌词
- **歌词占位符清理**：QQ 音乐 / TME 用 `//` 表示「该行无翻译」，现在 App 歌词页、桌面歌词、锁屏、投屏、一起听、下载导出六个出口统一过滤，不再出现满屏 `//`（1.22.27）
- **逐字歌词只前进**：进度采样天生比本地时钟旧，老实现每秒按权重往回拉，导致逐字越唱越慢、行尾还剩半句就切走；现在逐字时钟只前进，歌词行按真实播放位置校正（漂移 >800ms 才重排），自动逐字按语速估算行时长，前奏行不再一个字一个一个字慢慢蹦（1.22.34）

### 云盘与备份

- **WebDAV 云盘**：连接坚果云等 WebDAV 网盘，直接浏览、播放、扫描曲库
- 本地备份 / WebDAV 自动备份

### 其他

- 听歌播报（系统 TTS）、下载管理、下载文件内嵌标签 / 封面 / 歌词
- **侧边栏自绘抽屉**：不再使用原生 `DrawerLayoutAndroid`，宽度与遮罩共用一个 `Animated.Value`，从结构上杜绝「遮罩拉满、抽屉不出来、还吃掉所有触摸」（1.22.33）
- 主题系统：导入 / 导出 / 编辑自定义主题，支持竖屏与横屏背景图、字体、亮暗模式
- 在线检查更新，一键下载安装新版本
- 二改功能全量说明见 [doc/mod-features.md](doc/mod-features.md)

## 构建

需要 JDK 17、Android SDK、Node 18+。

```bash
npm install
# 新包名 com.lxmod.music
npm run build-android-arm64
# 原包名 cn.toside.music.mobile（覆盖升级用）
npm run build-android-arm64 -- -PorigPkg
```

产物在 `android/app/build/outputs/apk/`。签名配置放在 `android/keystore.properties`（不入库）。

## 更新日志

见 [Releases](https://github.com/yzdz666/lx-music-mobile-mod/releases) 与 [CHANGELOG.md](CHANGELOG.md)。

## 说明

- 本项目仅用于学习与技术交流，音乐版权归各平台与版权方所有，请支持正版。
- 软件不内置任何音源，音源需自行导入，使用产生的后果由使用者自行承担。
- 二改基于 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile)，感谢上游作者与所有贡献者。
- 非官方渠道的任何二次打包均与本项目无关。
