# 1.19.0 修复说明

本次围绕四个问题：ColorOS 锁屏歌词不显示、报错白屏（Critical Error）、下载设置、在线歌单与平台账号。

## 1. ColorOS / OPlus 锁屏歌词

### 结论：不是"没注册协议"，而是三处都没对上

1.19.0 之前确实已经把 `lyricInfo` 写进 `MediaMetadata`，但写进去的内容不符合
ColorOS-Live-Lyrics-Bridge 公开的《播放器接入协议》，系统直接丢弃：

| 问题 | 旧实现 | 系统要求 | 后果 |
| --- | --- | --- | --- |
| 缺少类型字段 | 没有 `lyricType` / `noLyric` | `lyricType: 0`、`noLyric: false` | 系统认不出这是标准时间轴 |
| 时间轴格式 | 原样透传 `[00:12.34]` | 绝对毫秒 `[00:12.340]` | 解析不出行 |
| 逐字歌词 | `rawLyric: ''` | 绝对时间逐字标签 `<00:12.340>字` | 无卡拉 OK |
| provider | `lx-music-mobile` | 真实包名 | 诊断与去重失败 |
| 会话声明 | 无 | manifest `io.github.andrealtb.lockscreenlyrics.OPLUS_MEDIA_HISTORY` | **部分 ColorOS 在进入 OPlus 管线前过滤掉播放器包，歌词页永远不出现** |
| 封面加载 | 重建 metadata 时丢掉 `lyricInfo` | 必须保留 | 封面加载完成后歌词消失 |
| 切歌 | 旧歌词残留 | 换曲先清空 | 串歌 |

### 本次改动

- `src/utils/lyricInfo.ts`（新增，纯函数）：按协议生成 payload
  - `lyricType: 0` / `noLyric: false` / `provider: cn.toside.music.mobile`
  - `lyric` 统一归一化成 `[mm:ss.mmm]`，多时间标签自动展开
  - `rawLyric` 由网易云官方 yrc、洛雪 lxlyric 或自动逐字轴生成绝对时间标签，没有逐字源时留空不伪造
  - `translationLyric` 归一化，`trackKey` = `id|歌名|歌手|时长`，`sessionGeneration` 换曲自增
  - payload 超过 64KB 时按「先丢逐字 → 再丢翻译 → 折叠行数」降级
- `src/core/player/systemLyric.ts`：只负责取当前歌曲信息 + 发布，去掉每行改写 `artist` 的兜底
  （它会污染通知栏，并造成高频 metadata 重建）
- `AndroidManifest.xml`：新增 `OPLUS_MEDIA_HISTORY` 声明
- `dependencies-patch.js`（track-player 原生补丁加固）
  - 记录 `lyricInfo` 属于哪一首，换曲清空，避免串歌
  - 封面异步加载后重建 metadata 时保留 `lyricInfo`
  - 所有 `setMetadata` 走 `safeSetMetadata`，捕获 `TransactionTooLargeException`

### 关于网易云逐字

网易云官方逐字接口已经接好：`https://interface3.music.163.com/eapi/song/lyric/v1`
（`yv/ytv/yrv` 参数，eapi 加密），返回的 `yrc.lyric` 形如
`[1000,2000](1000,300,0)你(1300,300,0)好`，由 `wy/lyric.js` 转成洛雪逐字格式。
本次只是把它接到了 `rawLyric`（锁屏）与桌面歌词，没有另造接口。

## 2. Critical Error 白屏

### 这个页面是什么

`react-native-exception-handler` 的原生异常页（`default_error_screen.xml`），
只有 **Java 层未捕获异常** 才会弹它。也就是说：应用不是 JS 报错，而是原生崩了。

### 已定位的两条必崩路径

1. `LyricModule.openOverlayPermissionActivity`
   用 React Context（非 Activity）直接 `startActivityForResult`，Android 10+ 必然抛
   `AndroidRuntimeException: Calling startActivity() from outside of an Activity context requires the FLAG_ACTIVITY_NEW_TASK flag`。
   这正是「点悬浮歌词权限 / 锁屏相关按钮」时最容易踩到的地方。
2. `UtilsModule.shareText`
   `Objects.requireNonNull(getCurrentActivity())`，Activity 已销毁时直接 NPE。

### 另一个高危点：歌词把 Binder 事务撑爆

`MediaSession.setMetadata` 是跨进程调用，Parcel 缓冲只有 1MB 且进程内共享。
旧实现会把整首逐字 + 翻译歌词（长歌词可达数百 KB）反复写进去，叠加每行一次
metadata 更新，很容易抛 `TransactionTooLargeException`（RuntimeException → 未捕获 → 崩）。

### 本次改动

- 上述两处原生调用改为 `FLAG_ACTIVITY_NEW_TASK` + `try/catch`，失败走 Promise reject，不再崩
- `safeSetMetadata` 兜底所有 setMetadata
- 歌词 payload 上限 64KB，并移除逐行 metadata 更新
- 错误页换成中文版：说明 + 重启 / 退出 / 查看详情（可选中复制），按钮文案也本地化
- 崩溃堆栈落盘（`error.log` / `crash.log`），JS 异常弹窗支持一键复制

## 3. 下载设置

- 新增「并发下载数量」1-5（默认 3），接入 `downloadMusics` 的 worker 数量
- 新增「下载目录」：内置目录浏览器（真实文件路径，不用 SAF，避免 `content://` 写不进去），
  选择前做可写探测，不可写会提示；支持一键恢复默认
- 目录可写性按目录缓存，切换目录后自动失效

## 4. 在线歌单 + 平台设置

- 侧边栏新增「在线歌单」「平台设置」
- 在线歌单：粘贴网易云 / QQ / 酷狗的歌单分享链接或 `wy:ID / tx:ID / kg:ID`，
  自动识别来源并打开详情页，复用已有的播放全部、收藏、下载能力；保留最近打开记录
- 平台设置：网易云 / QQ / 酷狗 Cookie 保存与清除，本地校验关键字段（`MUSIC_U` / `uin` / `kg_mid`），
  网易云私密歌单会自动带上 `MUSIC_U`

## 5. 测试记录

| 项目 | 结果 |
| --- | --- |
| `tsc --noEmit` | 新增代码无错误（仅剩 5 处历史类型告警，不影响构建） |
| ESLint（新增/改动文件） | 通过 |
| `npm run check:screens` | 通过（含新增 3 个页面） |
| 歌词 payload 单测（15 项） | 全部通过：时间轴归一化、多标签展开、逐字转换、字段完整性、超长裁剪、空歌词 |
| 歌单链接解析单测（10 项） | 全部通过（过程中修掉了酷狗 `/special/single/` 解析成 `single` 的 bug） |
| Gradle `assembleStandardRelease` | 通过 |

> 无法验证的部分：锁屏歌词、AOD、悬浮歌词需要真机 + ColorOS 16/17 才能看到效果，
> 沙箱没有 KVM，跑不了模拟器。代码层面已按官方协议逐字段对齐。
