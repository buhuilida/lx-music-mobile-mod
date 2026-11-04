# LX Mod · 逐字歌词 + 歌曲信息 → 百度网盘（特化版）

> 本仓库是一个**功能特化版**，只为一件事存在：**一步把「带逐字歌词和完整歌曲信息的音频文件」下载并传到百度网盘**。
> 其他功能都是跟随上游继承来的，属于附带，不是本仓库的维护重点。

## 上游与血缘

| 角色 | 仓库 | 作者 |
|---|---|---|
| 原版 | [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) | **lyswhut**（洛雪音乐） |
| 二改版（本仓库的直接上游） | [yzdz666/lx-music-mobile-mod](https://github.com/yzdz666/lx-music-mobile-mod) | **月下独酌**（yzdz666） |
| 本仓库 | [buhuilida/lx-music-mobile-mod](https://github.com/buhuilida/lx-music-mobile-mod) | 在上面两者基础上做特化 |

**功劳归属**：播放内核、音源机制、界面、一起听、主题、WebDAV 等绝大部分能力都来自上面两位作者，本仓库只是在他们成果上做了一层特化。上游仍在活跃更新，本仓库会定期同步上游 `main`（同步时优先保留上游实现，只在特化点上叠加）。

## 特化点（本仓库真正在维护的部分）

### 1. 下载即带完整的歌曲信息

下载完成后写入音频文件标签：**歌曲信息**（歌名 / 歌手 / 专辑）、**封面**、**歌词**。
歌词优先写「**逐字增强 LRC**」（A2 绝对时间轴）；音源没有逐字数据时，按每行时长均分生成，保证文件在任何播放器里都能显示逐字效果。是否写逐字由设置项「逐字歌词（增强 LRC）」控制。

### 2. 下载前先看歌词情况

点下载后先探测目标歌曲的歌词状态，逐首提示「逐字 / 仅逐行 / 无歌词」；批量下载时汇总成一个弹窗，确认后再入队，避免下完才发现没有逐字歌词。

### 3. 百度网盘直传

- 登录：内置 WebView 打开网页版登录，成功后直接读 Cookie（不经过第三方接口）
- 目录：浏览、搜索、按名称 / 时间排序、显示文件、删除、常用目录收藏
- 上传：下载完成后自动上传到指定目录，4MB 分片 + 断点续传，失败可单独重试
- 入口：侧边栏「百度网盘」进入首页视图（带侧边栏与底部播放条）；播放页下载按钮旁有「下载到网盘」，可选音质与目录
- 保存位置：设置里可选「本地 / 百度网盘」，选网盘时自动走上传流程

### 4. 顺手修掉的稳定性问题（上游当时没有的）

| 现象 | 根因 | 处理 |
|---|---|---|
| 播放要按两次 / 换源后一直"获取中" | 原生 `BackgroundTimer` 在本机延迟数秒甚至不触发，播放闸门靠它复位，一旦不触发就永久卡死 | 启动时整体替换为 JS 定时器 |
| 进度条不动 | 进度循环同样依赖该定时器，漏一次就永久停 | 改 JS `setInterval` |
| 启动必崩 | `updateNowPlayingTitles` 原生签名是 `(float, String, String, String)`，JS 传了整个对象 | 拆参调用 + 全局数值参数守卫 |
| 酷我歌词空白 | `parseLrc` 先 `replace` 再读 `RegExp.$1`，捕获组被清空 | 改为先取匹配结果 |
| 锁屏 / 背屏没有歌词 | 原生缺少歌词通道 | 补原生 `setLyricInfo` |

## 附带功能（跟随上游，不专门维护）

主题管理与导入导出、一起听（App / 网页互通）、WebDAV 云盘、播放页视觉与音质档位、网易云 / QQ / 酷狗账号与歌单、本地音乐与下载管理等，均为上游能力；本仓库只保证跟随同步，不做额外打磨。

## 安装

| 变体 | 包名 | 说明 |
|---|---|---|
| backscreen（主产物） | `cn.lxmusic.mod` | 可与原版洛雪共存，本仓库发布的更新默认指这个 |
| standard | `com.lxmod.music` | 上游新包名，与 backscreen 是**两个应用** |

两个包可以同时安装，但**更新只会更新同包名的那个**：装的是哪个，就下哪个的安装包（版本清单里按包名分开列）。

## 更新

应用内「检查更新」只认本仓库的 Release，并且**优先走国内镜像**：

```
原始地址  https://github.com/buhuilida/lx-music-mobile-mod/releases/latest/download/version.json
镜像前缀  https://ghfast.top/    https://gh-proxy.com/
备用      https://cdn.jsdelivr.net/gh/buhuilida/lx-music-mobile-mod@main/release/version.json
```

安装包同样是「先镜像、失败回源」逐个尝试，避免国内直连 github.com 超时。

> 启动时的自动检查默认关闭（避免调试包被自动更新覆盖），需要在设置里手动点「检查更新」。

## 构建与发布

**构建统一在 GitHub Actions 上做**，本地构建只作为应急手段。

| 触发方式 | 产物 | 是否发 Release |
|---|---|---|
| 打 `v*` tag 并推送 | 4 个 APK + `version.json` | 是 |
| 手动 Run（勾选 release） | 同上 | 是，按 `package.json` 的 version 自动建 tag |
| 手动 Run（不勾 release） | 同上，artifact 保留 30 天 | 否 |

发布前流水线会跑一次**隐私检查**（`scripts/privacy-check.mjs`）：扫描全部被跟踪文件，命中「所有者标识 / 真实密钥」这类阻断项就直接失败，不会把包发出去。

CI 需要 4 个 secret：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。签名必须与已有安装包一致，否则装不上。

本地应急构建：

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a -I ../gradle-mirrors.gradle
```

> `vendor/` 下三个 `file:` 依赖的 `lib/` 是构建产物且被包内 `.gitignore` 排除，已强制入库（CI 无法现场生成），改动依赖后记得重新生成并提交。

## 声明

- 本项目仅用于学习与技术交流，音乐版权归各平台与版权方所有，请支持正版。
- 软件不内置任何音源，音源需自行导入，使用产生的后果由使用者自行承担。
- 二次开发基于 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 与 [yzdz666/lx-music-mobile-mod](https://github.com/yzdz666/lx-music-mobile-mod)，感谢两位作者与所有贡献者。
- 非官方渠道的任何二次打包均与本项目无关。
