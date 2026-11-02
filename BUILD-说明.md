# 编译说明（v1.18.0）

本包已包含签名文件 `android/app/lxmusic-release.keystore` 与 `android/keystore.properties`，
`android/app/build.gradle` 的 release 构建会直接使用它们（与 1.17.1 同签名，可覆盖安装）。

## 环境
- JDK 17
- Android SDK：compileSdk 36、build-tools 35.0.0、NDK 26.1.10909125
- Node 18+ / npm 8.5.2+

## 编译
```bash
npm install
cd android
./gradlew assembleStandardRelease
```
产物：`android/app/build/outputs/apk/standard/release/`
- `*-universal.apk`（全架构，推荐）
- `*-arm64-v8a.apk` / `*-armeabi-v7a.apk`

若内存较小的机器编译 JS 时报 daemon 崩溃，可用：
```bash
NODE_OPTIONS="--max-old-space-size=2048" ./gradlew assembleStandardRelease \
  -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=768m" -Dorg.gradle.workers.max=1
```

国内网络建议在 `~/.gradle/init.gradle` 增加阿里云镜像，避免 dl.google.com TLS 握手失败。

## 本次改动
见 `doc/fix-report-1.18.0.md`。
