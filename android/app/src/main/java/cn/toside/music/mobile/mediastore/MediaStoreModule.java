package cn.toside.music.mobile.mediastore;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/**
 * 系统媒体库扫描（1.23.0）
 *
 * 为什么必须有这个模块：
 * 之前本地音乐是「遍历 /storage/emulated/0/Music、Download」找音频文件。
 * 实际用户的歌大多在网易云 / QQ 音乐 / 酷狗 的私有目录，或者在外置 SD 卡、
 * 甚至在 Android/data 这种普通目录遍历根本进不去的路径里，于是「给了权限也扫不到」。
 *
 * 正确做法是查 MediaStore：系统媒体库已经把全设备音频索引好了，
 * 只要拿到 READ_MEDIA_AUDIO（Android 13+）或 READ_EXTERNAL_STORAGE（12 及以下），
 * 一次查询就能拿到全量音频，且不受分区存储限制。
 */
public class MediaStoreModule extends ReactContextBaseJavaModule {
  private static final String TAG = "MediaStoreModule";

  public MediaStoreModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "MediaStoreModule";
  }

  /**
   * 查询系统媒体库里的全部音频。
   * 返回 [{ path, name, title, artist, album, duration, size }]
   */
  @ReactMethod
  public void getAudioFiles(Promise promise) {
    Cursor cursor = null;
    try {
      ContentResolver resolver = getReactApplicationContext().getContentResolver();
      Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

      String[] projection = new String[] {
        MediaStore.Audio.Media._ID,
        MediaStore.Audio.Media.DATA,
        MediaStore.Audio.Media.DISPLAY_NAME,
        MediaStore.Audio.Media.TITLE,
        MediaStore.Audio.Media.ARTIST,
        MediaStore.Audio.Media.ALBUM,
        MediaStore.Audio.Media.DURATION,
        MediaStore.Audio.Media.SIZE,
      };

      // IS_MUSIC != 0 过滤掉铃声、通知音、录音等
      String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
      String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";

      cursor = resolver.query(uri, projection, selection, null, sortOrder);
      WritableArray result = Arguments.createArray();
      if (cursor == null) {
        promise.resolve(result);
        return;
      }

      int idxData = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);
      int idxName = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
      int idxTitle = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
      int idxArtist = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
      int idxAlbum = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
      int idxDuration = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
      int idxSize = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);

      while (cursor.moveToNext()) {
        String path = idxData >= 0 ? cursor.getString(idxData) : null;
        // 没有真实路径的记录（部分云盘/流媒体索引）无法用本地播放器打开，跳过
        if (path == null || path.isEmpty()) continue;
        String name = idxName >= 0 ? cursor.getString(idxName) : null;
        if (name == null || name.isEmpty()) {
          int slash = path.lastIndexOf('/');
          name = slash >= 0 ? path.substring(slash + 1) : path;
        }
        WritableMap item = Arguments.createMap();
        item.putString("path", path);
        item.putString("name", name);
        item.putString("title", idxTitle >= 0 ? safe(cursor.getString(idxTitle)) : "");
        item.putString("artist", idxArtist >= 0 ? safe(cursor.getString(idxArtist)) : "");
        item.putString("album", idxAlbum >= 0 ? safe(cursor.getString(idxAlbum)) : "");
        item.putDouble("duration", idxDuration >= 0 ? cursor.getLong(idxDuration) : 0);
        item.putDouble("size", idxSize >= 0 ? cursor.getLong(idxSize) : 0);
        result.pushMap(item);
      }
      promise.resolve(result);
    } catch (SecurityException e) {
      Log.w(TAG, "query audio failed: no permission", e);
      promise.reject("E_NO_PERMISSION", "no audio read permission", e);
    } catch (Exception e) {
      Log.e(TAG, "query audio failed", e);
      promise.reject("E_QUERY_FAILED", e.getMessage() == null ? "query failed" : e.getMessage(), e);
    } finally {
      if (cursor != null) {
        try {
          cursor.close();
        } catch (Exception ignored) {
        }
      }
    }
  }

  /** MediaStore 里未知歌手/专辑是字符串 "<unknown>"，转成空串更好处理 */
  private String safe(String value) {
    if (value == null) return "";
    if ("<unknown>".equals(value)) return "";
    return value;
  }
}
