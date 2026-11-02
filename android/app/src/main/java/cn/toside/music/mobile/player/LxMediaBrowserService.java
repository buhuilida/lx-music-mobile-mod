package cn.toside.music.mobile.player;

import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.media.MediaBrowserService;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * 系统媒体浏览服务（1.20.0）
 *
 * ColorOS / OPlus 的媒体中心与锁屏歌词管线只识别声明了
 * android.media.browse.MediaBrowserService 的应用。
 * 没有这个服务时，MediaSession 里即使已经写好 lyricInfo，
 * 系统也只显示普通媒体卡，不会进入原生歌词页面。
 *
 * 这里不提供任何媒体内容，只把 TrackPlayer 当前活跃的 MediaSession token
 * 交给系统，让系统复用同一个会话。
 *
 * 注意：TrackPlayer 内部用的是 support/androidx 的 MediaSessionCompat，
 * 而 app 模块的 classpath 里不一定有对应的兼容包，所以这里全部走反射，
 * 避免编译期依赖导致 :app:compileJava 失败。
 */
public class LxMediaBrowserService extends MediaBrowserService {

  private static final String ROOT_ID = "lx_music_root";
  private static final String METADATA_MANAGER = "com.guichaguri.trackplayer.service.metadata.MetadataManager";
  private static final int MAX_RETRY = 40;
  private static final long RETRY_DELAY = 250L;

  private boolean tokenSet = false;
  private int retry = 0;

  @Override
  public void onCreate() {
    super.onCreate();
    // 播放服务可能还没启动，轮询等待 MediaSession 就绪
    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
      @Override
      public void run() {
        if (tokenSet) return;
        if (trySetToken()) return;
        if (++retry < MAX_RETRY) {
          new Handler(Looper.getMainLooper()).postDelayed(this, RETRY_DELAY);
        }
      }
    }, 150);
  }

  private boolean trySetToken() {
    try {
      Class<?> managerClass = Class.forName(METADATA_MANAGER);
      Method getter = managerClass.getMethod("getActiveSession");
      Object session = getter.invoke(null);
      if (session == null) return false;

      Object tokenCompat = session.getClass().getMethod("getSessionToken").invoke(session);
      if (tokenCompat == null) return false;
      Object token = tokenCompat.getClass().getMethod("getToken").invoke(tokenCompat);
      if (token instanceof MediaSession.Token) {
        setSessionToken((MediaSession.Token) token);
        tokenSet = true;
        return true;
      }
    } catch (Exception ignored) {
      // token 已设置 / 会话已销毁 / 播放器未加载，忽略后继续重试
    }
    return false;
  }

  @Override
  public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
    // 系统可能在播放服务启动前就来查询，这里再补一次 token
    if (!tokenSet) trySetToken();
    return new BrowserRoot(ROOT_ID, null);
  }

  @Override
  public void onLoadChildren(String parentId, Result<List<MediaBrowser.MediaItem>> result) {
    result.sendResult(new ArrayList<>());
  }
}
