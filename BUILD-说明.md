# 编译说明（v1.20.0）

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
见 `doc/fix-report-1.19.0.md`。
