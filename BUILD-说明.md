# 编译说明（v1.22.19）

本包已包含签名文件 `android/app/lxmusic-release.keystore` 与 `android/keystore.properties`，
`android/app/build.gradle` 的 release 构建会直接使用它们（与 1.17.x / 1.18.0 同签名，可覆盖安装）。

## 环境
- JDK 17
- Android SDK：compileSdk 36、build-tools 35.0.0、NDK 26.1.10909125
- Node 18+ / npm 8.5.2+

## 编译
```bash
npm install          # 会自动执行 dependencies-patch.js，给 track-player 打歌词补丁
cd android
./gradlew assembleStandardRelease
```
产物：`android/app/build/outputs/apk/standard/release/`
- `*-universal.apk`（全架构，推荐）
- `*-arm64-v8a.apk` / `*-armeabi-v7a.apk`

## 两种包名怎么切（1.22.19）

同一份源码，靠一个 Gradle 属性切换 `applicationId`，**不需要改任何代码**：

| 目标 | 命令 | 产物 | 包名 |
|---|---|---|---|
| 新包名版（可与原版洛雪共存） | `./gradlew assembleStandardRelease` | `lxmod-v1.22.19-*.apk` | `com.lxmod.music` |
| 原包名版（可覆盖升级旧安装、保数据） | `./gradlew assembleStandardRelease -PorigPkg` | `lxmod-origpkg-v1.22.19-*.apk` | `cn.toside.music.mobile` |
| 背景播放变体（借壳汽水音乐） | `./gradlew assembleBackscreenRelease` | `lxmod-v1.22.19-backscreen-*.apk` | `com.luna.music` |

实现要点，改包名时别踩：

1. `namespace` 固定 `com.lxmod.music`（Java 源码与 `R` 类都在这里），只有 `applicationId` 变。
2. `AndroidManifest.xml` 里 `MainApplication` / `MainActivity` / `player.LxMediaBrowserService`
   必须写**全限定名**（`com.lxmod.music.MainActivity`）。写成 `.MainActivity` 时会按
   `applicationId` 解析，换包名后直接 `ClassNotFoundException` 启动闪退。
3. FileProvider 用 `${applicationId}.provider` 占位符；JS 侧安装 APK 时通过
   `getPackageName()` 取运行时包名拼 authority，不要硬编码。
4. 两种包名的产物会互相覆盖输出目录里的同名文件——先构建哪个就先拷走，别指望它们同时躺在 release 目录。

若内存较小的机器编译 JS 时报 daemon 崩溃，可用：
```bash
NODE_OPTIONS="--max-old-space-size=4096" ./gradlew assembleStandardRelease \
  -Dorg.gradle.jvmargs="-Xmx3072m -XX:MaxMetaspaceSize=1024m" -Dorg.gradle.workers.max=1
```

若 `./gradlew` 卡在下载 gradle-8.8（公司网络 / 沙箱常见），直接用本地 Gradle：
```bash
/opt/gradle-8.8/bin/gradle assembleStandardRelease
```

国内网络建议在 `~/.gradle/init.gradle` 增加阿里云镜像，避免 dl.google.com TLS 握手失败。

## 依赖补丁（重要）
`dependencies-patch.js` 会修改 `node_modules` 里的两处源码，**必须执行**，否则锁屏歌词不生效：

1. `react-native-track-player` 的 `MetadataManager.java`
   - 把 `lyricInfo` 写进 `MediaMetadata`（ColorOS 原生锁屏歌词）
   - 暴露 `getActiveSession()`，供 `LxMediaBrowserService` 把同一个会话交给系统媒体中心
   - 换曲清空、封面重建时保留歌词
   - `setMetadata` 全部走 `safeSetMetadata`，避免 Binder 事务超限崩溃
2. `react-native-exception-handler` 的 `DefaultErrorScreen.java` + 同名布局
   - 原生崩溃页中文化

补丁是幂等的，重复 `npm install` 不会重复插入。

## 本次改动
见 `更新说明-1.22.19.md`。
