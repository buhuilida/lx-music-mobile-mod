// 修补依赖源码以使构建的依赖恢复正常工作
//
// 主要内容：
// 1. MediaSession 的 MediaMetadata 带上 ColorOS / OPlus 原生锁屏歌词字段 lyricInfo
//    （契约见 ColorOS-Live-Lyrics-Bridge《播放器接入协议》）
// 2. 切歌清空歌词、封面重建 metadata 时保留歌词
// 3. setMetadata 全部走安全包装，避免歌词过大时 Binder 事务抛异常导致闪退
// 4. 原生崩溃页按钮中文化
//
// 注意：脚本必须是幂等的，重复执行不能重复插入
//（之前出现过把字段插了三遍导致 javac 报 "already defined"）。

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const metadataManagerPath = './node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java'
const interfacesPath = './node_modules/react-native-track-player/lib/interfaces.d.ts'
const errorScreenPath = './node_modules/react-native-exception-handler/android/src/main/java/com/masteratul/exceptionhandler/DefaultErrorScreen.java'

// 已经打过补丁的标记：出现这些字符串就整块跳过
// 注意：MetadataManager 有多个互不相邻的插入点，不能用同一个 guard，
// 否则先插入的标记会把后面的插入点一起跳过（曾导致 activeSession 赋值漏插）。
const guards = {
  [interfacesPath]: 'lyricInfo?: string',
  [errorScreenPath]: '查看错误详情',
}

const patchs = [
  // 1. 字段 + 安全 setMetadata + 归属判断工具
  [
    metadataManagerPath,
    '    private MediaMetadataCompat.Builder prevMetadata = null;\n',
    '    private MediaMetadataCompat.Builder prevMetadata = null;\n' +
      '    // 系统歌词：ColorOS / OPlus 从 MediaMetadata["lyricInfo"] 读取\n' +
      '    private String lyricInfo = null;\n' +
      '    // 当前 lyricInfo 属于哪一首，防止切歌后把上一首的歌词挂到新歌上\n' +
      '    private String lyricTrackKey = null;\n' +
      '    // 当前活跃会话：MediaBrowserService 需要把同一个 token 交给系统媒体中心\n' +
      '    private static java.lang.ref.WeakReference<MediaSessionCompat> activeSession = new java.lang.ref.WeakReference<>(null);\n' +
      '\n' +
      '    public static MediaSessionCompat getActiveSession() {\n' +
      '      return activeSession == null ? null : activeSession.get();\n' +
      '    }\n' +
      '\n' +
      '    /** MediaSession.setMetadata 是 Binder 调用，歌词过大时会抛 TransactionTooLargeException */\n' +
      '    private void safeSetMetadata(MediaMetadataCompat metadata) {\n' +
      '      try {\n' +
      '        session.setMetadata(metadata);\n' +
      '      } catch (Exception err) {\n' +
      '        android.util.Log.w("TrackPlayer", "setMetadata failed: " + err.getMessage());\n' +
      '      }\n' +
      '    }\n' +
      '\n' +
      '    private static String trackKeyOf(TrackMetadata track) {\n' +
      '      if (track == null) return "";\n' +
      '      return String.valueOf(track.title) + "|" + String.valueOf(track.artist) + "|" + track.duration;\n' +
      '    }\n',
  ],
  // 1.1 构造时记录当前会话，供 MediaBrowserService 暴露给系统
  [
    metadataManagerPath,
    '        this.builder = new NotificationCompat.Builder(service, channel);\n        this.session = new MediaSessionCompat(service, "TrackPlayer", null, null);\n',
    '        this.builder = new NotificationCompat.Builder(service, channel);\n        this.session = new MediaSessionCompat(service, "TrackPlayer", null, null);\n' +
      '        activeSession = new java.lang.ref.WeakReference<>(session);\n',
  ],
  // 2. updateTitles：接收 lyricInfo 并记录归属
  //    锚点用 lyric 块而不是 setMetadata 行，避免被 globalPatch 替换后匹配不到
  [
    metadataManagerPath,
    '      if (data.containsKey("lyric")) {\n' +
      '        prevMetadata.putString("android.media.metadata.LYRICS", data.getString("lyric"));\n' +
      '      }\n',
    '      if (data.containsKey("lyric")) {\n' +
      '        prevMetadata.putString("android.media.metadata.LYRICS", data.getString("lyric"));\n' +
      '      }\n' +
      '      if (data.containsKey("lyricInfo")) {\n' +
      '        String value = data.getString("lyricInfo");\n' +
      '        lyricInfo = value == null || value.length() == 0 ? null : value;\n' +
      '        try {\n' +
      '          lyricTrackKey = lyricInfo == null ? null : trackKeyOf(manager.getPlayback().getCurrentTrack());\n' +
      '        } catch (Exception ignored) {\n' +
      '        }\n' +
      '        // null 会把旧歌词从 extras 里移除，避免切歌后仍然显示上一首\n' +
      '        prevMetadata.putString("lyricInfo", lyricInfo);\n' +
      '      }\n',
  ],
  // 3. updateMetadata：换曲先摘掉旧歌词，同曲继续带上
  [
    metadataManagerPath,
    '        MediaMetadataCompat.Builder metadata = track.toMediaMetadata();\n        prevMetadata = metadata;\n',
    '        MediaMetadataCompat.Builder metadata = track.toMediaMetadata();\n' +
      '        prevMetadata = metadata;\n' +
      '        String newTrackKey = trackKeyOf(track);\n' +
      '        if (lyricTrackKey == null || !lyricTrackKey.equals(newTrackKey)) {\n' +
      '          lyricInfo = null;\n' +
      '          lyricTrackKey = newTrackKey;\n' +
      '        }\n' +
      '        if (lyricInfo != null) metadata.putString("lyricInfo", lyricInfo);\n',
  ],
  // 4. updateArtwork：封面异步就绪后重建 metadata，别把歌词丢掉
  [
    metadataManagerPath,
    '        metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap);\n        builder.setLargeIcon(bitmap);\n',
    '        metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap);\n' +
      '        if (lyricInfo != null) metadata.putString("lyricInfo", lyricInfo);\n' +
      '        builder.setLargeIcon(bitmap);\n',
  ],
  // 5. 类型声明补充 lyricInfo
  [
    interfacesPath,
    '    lyric?: string;\n}',
    '    lyric?: string;\n    lyricInfo?: string;\n}',
  ],
  // 6. 原生错误页按钮中文化
  [errorScreenPath, 'showDetailsButton.setText("SHOW DETAILS");', 'showDetailsButton.setText("查看错误详情");'],
  [errorScreenPath, 'showDetailsButton.setText("HIDE DETAILS");', 'showDetailsButton.setText("收起详情");'],
]

// MetadataManager 同一个文件里有多个互不相邻的插入点，必须各自用独立标记判断，
// 否则第一条插入的标记会把后面几条一起跳过（曾导致 activeSession 赋值漏插）。
const patchGuardsByIndex = new Map([
  [0, 'public static MediaSessionCompat getActiveSession()'],
  [1, 'activeSession = new java.lang.ref.WeakReference<>(session);'],
  [2, 'if (data.containsKey("lyricInfo")) {'],
  [3, 'String newTrackKey = trackKeyOf(track);'],
  [4, 'metadata.putString("lyricInfo", lyricInfo);\n        builder.setLargeIcon(bitmap);'],
])

// 全局替换：所有 setMetadata 都走安全包装
const globalPatchs = [
  [metadataManagerPath, 'session.setMetadata(metadata.build());', 'safeSetMetadata(metadata.build());'],
  [metadataManagerPath, 'session.setMetadata(prevMetadata.build());', 'safeSetMetadata(prevMetadata.build());'],
]


;(async() => {
  for (const [index, [filePath, fromStr, toStr]] of patchs.entries()) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      let file = (await fs.promises.readFile(filePath)).toString()
      const guard = patchGuardsByIndex.get(index) ?? guards[filePath]
      if (guard && file.includes(guard)) {
        console.log('  skipped (already patched)')
        continue
      }
      if (file.includes(toStr)) {
        console.log('  skipped (already applied)')
        continue
      }
      if (!file.includes(fromStr)) {
        console.log('  skipped (pattern not found)')
        continue
      }
      file = file.replace(fromStr, toStr)
      await fs.promises.writeFile(filePath, file)
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }

  for (const [filePath, fromStr, toStr] of globalPatchs) {
    console.log(`Patching (all) ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      if (!file.includes(fromStr)) {
        console.log('  skipped (already patched or pattern not found)')
        continue
      }
      await fs.promises.writeFile(filePath, file.split(fromStr).join(toStr))
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }

  console.log('\nDependencies patch finished.\n')
})()
