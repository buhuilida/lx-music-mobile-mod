// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const metadataManagerPath = './node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java'
const interfacesPath = './node_modules/react-native-track-player/lib/interfaces.d.ts'

const patchs = [
  // 让 MediaSession 的 MediaMetadata 带上 ColorOS / OPlus 原生歌词字段 lyricInfo
  [
    metadataManagerPath,
    '    private MediaMetadataCompat.Builder prevMetadata = null;\n',
    '    private MediaMetadataCompat.Builder prevMetadata = null;\n' +
      '    // 系统歌词：ColorOS / OPlus 从 MediaMetadata["lyricInfo"] 读取\n' +
      '    private String lyricInfo = null;\n',
  ],
  [
    metadataManagerPath,
    '      session.setMetadata(prevMetadata.build());\n      updatePlaybackState(manager.getPlayback());\n',
    '      if (data.containsKey("lyricInfo")) {\n' +
      '        String value = data.getString("lyricInfo");\n' +
      '        lyricInfo = value == null || value.length() == 0 ? null : value;\n' +
      '        // null 会把旧歌词从 extras 里移除，避免切歌后仍然显示上一首\n' +
      '        prevMetadata.putString("lyricInfo", lyricInfo);\n' +
      '      }\n' +
      '      session.setMetadata(prevMetadata.build());\n      updatePlaybackState(manager.getPlayback());\n',
  ],
  [
    metadataManagerPath,
    '        MediaMetadataCompat.Builder metadata = track.toMediaMetadata();\n        prevMetadata = metadata;\n',
    '        MediaMetadataCompat.Builder metadata = track.toMediaMetadata();\n' +
      '        prevMetadata = metadata;\n' +
      '        if (lyricInfo != null) metadata.putString("lyricInfo", lyricInfo);\n',
  ],
  // 类型声明补充 lyricInfo
  [
    interfacesPath,
    '    lyric?: string;\n}',
    '    lyric?: string;\n    lyricInfo?: string;\n}',
  ],
]


;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      await fs.promises.writeFile(filePath, file.replace(fromStr, toStr))
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()

