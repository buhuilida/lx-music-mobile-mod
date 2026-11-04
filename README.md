<p align="center">
  <img width="120" src="https://github.com/lyswhut/lx-music-mobile/raw/master/doc/images/icon.png" alt="lxmod logo">
</p>

<h1 align="center">lxmod</h1>

<p align="center">
  <a href="https://github.com/yzdz666/lx-music-mobile-mod/releases"><img src="https://img.shields.io/github/v/release/yzdz666/lx-music-mobile-mod?label=release" alt="Release"></a>
  <a href="https://github.com/yzdz666/lx-music-mobile-mod/releases"><img src="https://img.shields.io/github/downloads/yzdz666/lx-music-mobile-mod/total" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/Android-5.0%2B-3ddc84" alt="Android">
  <img src="https://img.shields.io/badge/package-com.lxmod.music-blue" alt="Package">
</p>

<p align="center">基于 React Native 的音乐播放器 · 洛雪音乐移动版二改</p>

---

## 这是什么

**lxmod** 是 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile)（洛雪音乐移动版）的二次开发版本，在保留原有播放、歌单、音源机制的基础上，补齐了一批日常使用中缺席的能力。

- **应用包名**：`com.lxmod.music`（与原版洛雪 **可共存安装**）
- **当前版本**：1.22.26（versionCode 131000）
- **作者**：月下独酌 · QQ 3139606844

## 下载

所有安装包与源码见 [Releases](https://github.com/yzdz666/lx-music-mobile-mod/releases)。

| 文件 | 适用场景 |
| --- | --- |
| `lxmod-v1.22.26-arm64-v8a.apk` | 新包名常规版，绝大多数手机（可与原版共存） |
| `lxmod-v1.22.26-universal.apk` | 新包名全架构版，不知道选哪个就选它 |
| `lxmod-v1.22.26-backscreen-arm64-v8a.apk` | 新包名 + 锁屏歌词增强 |
| `lxmod-origpkg-v1.22.26-arm64-v8a.apk` | **原包名** `cn.toside.music.mobile`，用于从旧版覆盖升级（保留数据，不能与原版共存） |
| `lx-music-mod-src-v1.22.26.zip` | 源码（不含签名密钥） |

> 从旧版（1.22.20 ~ 1.22.25）升级：想保留数据就用 `lxmod-origpkg-*`；想和原版洛雪并存就用 `lxmod-*`（两者数据不互通，需重新登录）。

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

### 云盘与备份

- **WebDAV 云盘**：连接坚果云等 WebDAV 网盘，直接浏览、播放、扫描曲库
- 本地备份 / WebDAV 自动备份

### 其他

- 听歌播报（系统 TTS）、下载管理、下载文件内嵌标签 / 封面 / 歌词
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

## 本仓库（fork）的发布方式

本仓库是 [`yzdz666/lx-music-mobile-mod`](https://github.com/yzdz666/lx-music-mobile-mod) 的 fork，在跟上上游的同时保留了一批自有改动（百度网盘、下载前歌词探测、定时器修复等）。包名与上游解耦：`standard` = `com.lxmod.music`，`backscreen`（共存版，主产物）= `cn.lxmusic.mod`。

**应用内更新只认本仓库的 Release**：

```
https://github.com/buhuilida/lx-music-mobile-mod/releases/latest/download/version.json
```

**发版**（打 tag 触发 `.github/workflows/android-release.yml`，自动构建、生成清单、上传 Release）：

```bash
# 1. 改 package.json 的 version / versionCode
# 2. 提交后打 tag 并推送
git tag v1.22.26-mod.1 && git push origin v1.22.26-mod.1
```

CI 需要 4 个 secret：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。签名与本地 `android/app/lxmod.keystore` 必须一致，否则装不上已有版本。

**本地构建**：

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a -I ../gradle-mirrors.gradle
```

> `vendor/` 下三个 `file:` 依赖的 `lib/` 是构建产物且被包内 `.gitignore` 排除，已强制入库（CI 无法现场生成），改动依赖后记得重新生成并提交。
