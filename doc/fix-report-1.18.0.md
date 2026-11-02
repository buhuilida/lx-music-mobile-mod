# LX Music Mod v1.18.0 更新说明

> 基于 v1.17.1 继续迭代，重点：完整音质体系与徽章、安卓原生锁屏显示、
> 桌面歌词全平台逐字 + 翻译、接近主流音乐 App 的音效系统。
> 签名与 v1.17.1 一致（CN=YueXiaDuZhuo，SHA-1 `E0:57:01:E5:…:8A`），可直接覆盖安装。

## 1. 完整音质体系（128K → Master）

支持并在设置中可选：

| 档位 | 显示名称 | 徽章颜色 |
| --- | --- | --- |
| 128k | 128K | 灰 |
| 192k | 192K | 灰 |
| 320k | 320K | 蓝 |
| flac | FLAC | 绿 |
| flac24bit | FLAC 24bit | 深绿 |
| hires | Hi-Res | 金 |
| atmos | Atmos | 紫 |
| atmos_plus | Atmos+ | 深紫 |
| master | Master | 红 |

改动点：

- `LX.Quality` 增加 `hires` / `atmos` / `atmos_plus`，全链路（设置、播放、下载、音源测试、一起听、缓存键）同步。
- 新增 `src/config/quality.ts` 统一维护顺序、名称、颜色、文件后缀，避免各页面映射不一致。
- 播放页徽标改为带颜色胶囊，格式 `音质 · 音源`（如 `Hi-Res · WY`）。
- 歌曲列表标签按最高档位显示 `Master / Atmos+ / Atmos / Hi-Res / 24bit / SQ / HQ`。
- 下载弹窗、下载管理页、音源测试、一起听全部显示统一名称。
- 修复「设置 Master 却显示 FLAC」：徽标记录「实际请求成功的档位」，母带 / 空间音频以 FLAC 容器返回时仍显示正确档位；回退到低档位时不再错误显示高档位。

## 2. 安卓原生锁屏显示

- 新增设置项「播放 → 锁屏显示」，可开关「锁屏歌词」，并直达系统「锁屏显示 / 通知管理」页。
  - MIUI / HyperOS 使用 `miui.intent.action.APP_NOTIFICATION_SETTINGS` 直达（即截图中的「锁屏显示权限」页）；
  - 其他 ROM 依次回退到原生通知设置、应用详情页。
- 锁屏歌词继续走 MediaSession：当前歌词行写入 `artist`，ColorOS / OPlus 等机型同时读取完整 `lyricInfo` JSON。
- 补充 `POST_NOTIFICATIONS` 权限声明；媒体通知本身已是 `VISIBILITY_PUBLIC`，允许锁屏展示。
- 通知权限状态实时显示，未开启时一键跳转。

## 3. 桌面歌词：全平台逐字 + 翻译

原实现有两个硬伤：

1. 多行模式用的是原生 `TextView`，逐字染色的调用全部落空（只有单行模式才用 `LyricTextView`）；
2. 翻译用 `\n` 拼进同一个字符串，而自绘 `canvas.drawText` 不解析换行，翻译实际不显示。

修复：

- 单行 / 多行统一使用自绘 `LyricTextView`，逐字卡拉 OK 在所有模式生效。
- 重写绘制：第一行歌词按 `<偏移,时长>` 逐字裁剪染色，后续行用 0.64 倍字号、略透明地画在下方，形成「歌词 + 翻译」的网易云式排版。
- 新增桌面歌词「显示歌词翻译」开关（默认开），与播放页翻译解耦。
- 新增时间键归一化：`[00:05.50]` 与 `[00:05.500]` 统一成毫秒键，逐字行 / 翻译行不再因小数位不同而匹配失败。
- 所有平台缺逐字歌词时，`buildAutoWordLyric()` 按行时间自动生成逐字时间轴；已有逐字歌词则原样使用。

## 4. 音效系统（向主流音乐 App 看齐）

新增 12 组调音预设 + 自定义：

关闭、人声增强、超重低音、3D 环绕、现场、电子、摇滚、民谣、古典、爵士、电影院、音乐厅。

技术实现：

- 预设用「频率 → 增益(dB)」节点描述，运行时按设备实际均衡器频段插值，5 段 / 10 段机型听感一致。
- 原生在 Equalizer + BassBoost + Virtualizer + PresetReverb 基础上新增 `LoudnessEnhancer`（响度增强），UI 增加响度滑杆。
- 设置页改为预设网格 + 当前音效提示 + 低频 / 环绕 / 响度滑杆 + 混响选择 + 可重置的逐频段均衡器（带 dB 数值）。

## 5. 验证

- TypeScript 全量类型检查通过（仅剩仓库原有的第三方类型告警，与本次改动无关）。
- ESLint 本次改动文件 0 error。
- `npm run check:screens` 通过（含本地音乐页）。
- Java 编译通过，`javap` 确认 `LyricTextView.translationPaint/onDraw`、`normalizeTimeKey`、`setLoudnessGain` 均进入产物。
- APK 校验：`versionName=1.18.0`、`versionCode=100`、签名 CN=YueXiaDuZhuo。
- 逻辑测试：
  - 自动逐字歌词生成 3 行、逐字 token 完整，时间轴 1000/5500/9200ms 与 LRC 对齐；
  - 音质名称 / 后缀 / 徽章映射全部正确；
  - 时间键 `00:05.50`、`00:05.500`、`00:05.5` 归一化结果一致。

## 已知限制

- 沙箱无 KVM，无法启动安卓模拟器做真机点击回归；锁屏卡片、桌面歌词悬浮窗、音效听感需在真机验证。
- 音效基于系统 `audiofx`，部分机型 / 蓝牙耳机不支持 Virtualizer 或 LoudnessEnhancer，会静默跳过，不影响播放。
- Atmos / Atmos+ 的实际可用性取决于音源脚本是否声明并下发对应档位；未声明时自动回退到歌曲支持的最高档。
