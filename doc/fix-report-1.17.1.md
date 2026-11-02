# 1.17.1 修复与新增说明

本版本基于 1.17.0 源码，修复了反馈的全部问题，并新增「一键下载歌单」「最高音质下载」「全平台逐字歌词」。

## 一、修复的问题

### 1. WebDAV 一直提示「网络错误」（图 1）

**根因**：`src/core/sync/webdav.ts` 里用 `global.btoa(...)` 生成 Basic 认证头。React Native 的 JS 运行时（Hermes）**没有** `btoa`，所以每次请求在执行 `fetch` 之前就抛了 `TypeError`，又被 `request()` 的 `catch` 统一包装成 `WebDAVError('network')`，于是无论地址、账号、密码是否正确，界面都只会弹「网络错误，请检查地址与网络」。

服务器本身是正常的（已用你的账号实测：`PROPFIND /dav` 返回 207、`MKCOL` 405=目录已存在、`PUT` 201、`GET` 302 跳对象存储后能拿到 JSON）。

**修复**：
- 新增 `encodeBase64()`：优先用 `Buffer`（shim.js 已注入，天然支持中文密码），其次 `btoa` + UTF-8 转义，最后纯 JS 兜底，彻底不依赖 `global.btoa`；
- 请求加 `redirect: 'follow'`，兼容 `pan.cdn.ad` 这类 `GET` 会 302 到临时地址的网盘；
- 细化错误码：401/403→认证失败、404→备份不存在、507→容量不足、返回 HTML→明确提示；
- `testConnection` 兼容 400/405/501 的服务器（改用 GET 复验）。

**验证**：用 Node 模拟 Hermes（删除 `global.btoa`）直接跑 `testConnection / putFile / getFile`，对接 `https://pan.cdn.ad/dav` + 你的账号，全部通过，中文内容读写正常。

### 2. 赞助码没有居中（图 2）

原实现把整块内容塞进全屏 `ScrollView`，图片按 `min(宽-96, 高*0.5)` 计算且底部按钮 `marginBottom: 40`，导致卡片偏上、被裁切。

**修复**：改为「半透明遮罩 + 居中卡片」布局（`alignItems/justifyContent: center`），图片尺寸按 `min(宽-104, 高*0.54)` 自适应，关闭按钮放进卡片内部，卡片自身拦截点击不会误触关闭。

### 3. 点「本地音乐」进到歌单页、扫描后黑屏（图 3）

**根因**：
- 侧边栏 `nav_local` 的实现是 `setActiveList(LOCAL_LIST_ID)` + 切到歌单页，本质就是打开「歌单」，而不是本地音乐页面；
- 若还没扫描过，"本地音乐"歌单不存在，歌单页拿不到数据 → 一片空白（黑屏）；
- 扫描函数把 `file://` 前缀写进了 `meta.filePath`，`existsFile/stat/播放器` 都解析不到文件；同时缺失 `MusicInfoLocal` 必需的 `songId`、`ext` 字段；
- 大目录扫描时无权限申请、无上限、无让出主线程，容易卡死。

**修复**：
- 新增独立「本地音乐」页面 `src/screens/LocalMusic`（列表 / 播放全部 / 扫描 / 空状态引导），侧边栏 `nav_local` 改为 push 该页面；
- 重写 `src/core/localMusic.ts`：扫描前申请 `READ_MEDIA_AUDIO` / `READ_EXTERNAL_STORAGE`；纯路径存储；补齐 `songId/ext`；跳过隐藏目录与 `Android/data`；最多 5000 首、每 50 首让出一次 JS 线程；即使 0 首也保证歌单存在，不会再白屏；
- 设置页「扫描本地音乐」增加实时数量提示，扫描完成后自动进入本地音乐页面。

### 4. 设置了 Master 却显示 FLAC（图 4、图 5）

**根因**有两处：
1. `getPlayQuality()` 要求「歌曲元信息」和「音源声明」同时支持该档位才请求。歌单里缓存的 `_qualitys` 是加入歌单时的旧数据（那时音源可能还没开母带），于是即便音源支持 Master，也一直被降级成 FLAC；
2. 播放页徽标只在实际发起请求时写入，命中 URL 缓存时直接 `return`，导致徽标停留在上一首/上一次的档位；且预加载/下载也会写徽标。

**修复**：
- `getPlayQuality()` 改为：两边都支持→用该档位；仅音源声明支持→按用户设置请求（实际音质由音源返回）；都没有才回退；
- 请求失败时自动按「歌曲自身支持的档位」重试一次，避免因强制母带导致播放失败；
- 命中缓存也更新徽标，且只有当前正在播放的歌曲才允许写徽标；
- 徽标显示逻辑：请求 Master、音源返回 flac/flac24bit（母带本身是 FLAC 容器）时显示 **Master**，真降级（如 320K）则如实显示。

## 二、新增功能

### 1. 一键下载歌单全部歌曲

- `downloadMusics()` / `downloadListMusics()`：跳过本地歌曲与已下载歌曲，**并发 3** 首，逐首取最高可用音质；
- 入口：
  - 歌单详情页操作栏「下载全部」；
  - 「我的列表」顶部工具栏下载图标；
  - 播放页下载弹窗新增「最高音质（自动）」，一次选中最高档位。

### 2. 全平台逐字歌词

- 修复 kw 歌词解析器的全局正则 `lastIndex` 问题（之前会**隔行丢失**歌词）；
- kw 逐字解析：没有逐字标签的行（前奏/纯文本行）不再被丢弃；
- 新增 `buildAutoWordLyric()`：任何音源只要返回普通 LRC，就按「行时间→下一行时间」自动生成逐字时间轴（洛雪标准 `[mm:ss.xxx]<偏移,时长>字`），保证所有平台都能卡拉 OK 式逐字滚动；
- 已实测：生成结果能被 `parseWordLyric()` 正确解析为逐字序列。

## 三、构建与签名

- 版本：`1.17.1`（versionCode 99，分架构包为 99003 / 99001）
- 签名：使用你提供的 `android/app/lxmusic-release.keystore`（CN=YueXiaDuZhuo，SHA1 `E0:57:01:E5:F4:B0:23:4E:45:1B:B3:16:9C:94:16:67:DF:CD:DC:8A`），与旧版同签名，可直接覆盖安装；
- 产物：`universal`（全架构，推荐）、`arm64-v8a`、`armeabi-v7a`。

> 因沙箱内没有 KVM，无法启动安卓模拟器做真机点击验证；已完成的验证包括：TypeScript 类型检查、ESLint、项目自带 `check:screens` 页面注册校验、Hermes 字节码编译、APK 签名/版本校验，以及 WebDAV 与逐字歌词的真实数据测试。建议安装后重点回归：WebDAV 测试连接→备份→恢复、扫描本地音乐、歌单「下载全部」、播放页音质徽标。
