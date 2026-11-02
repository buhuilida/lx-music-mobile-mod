package cn.toside.music.mobile.ext;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;

/**
 * 扩展原生能力：
 * 1. 从系统相册选择图片（复制到 App 私有目录，避免 content:// 权限问题）
 * 2. 听歌播报（TextToSpeech）
 * 3. 歌词灵动岛 / 常驻通知（Android 16 起尝试提升为 Live Update）
 */
public class ExtModule extends ReactContextBaseJavaModule implements ActivityEventListener, LifecycleEventListener {

  private static final String TAG = "ExtModule";
  private static final int REQUEST_PICK_IMAGE = 0x4c58;
  private static final String CHANNEL_ISLAND = "lx_lyric_island_v2";
  private static final int NOTIFICATION_ISLAND = 0x4c59;
  private static final String CHANNEL_CHAT = "lx_listen_together_chat_v1";
  private static final int NOTIFICATION_CHAT = 0x4c5a;

  private Promise pickImagePromise;
  private TextToSpeech tts;
  private boolean ttsReady = false;
  private boolean ttsInitializing = false;
  private String pendingTtsText;

  public ExtModule(ReactApplicationContext reactContext) {
    super(reactContext);
    reactContext.addActivityEventListener(this);
    reactContext.addLifecycleEventListener(this);
  }

  @Override
  public String getName() {
    return "Ext";
  }

  // ------------------------------------------------------------------ 选图

  @ReactMethod
  public void pickImage(final Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("no_activity", "no current activity");
      return;
    }
    if (pickImagePromise != null) {
      pickImagePromise.reject("busy", "another pick is running");
    }
    pickImagePromise = promise;
    try {
      Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
      intent.setType("image/*");
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      activity.startActivityForResult(Intent.createChooser(intent, "选择图片"), REQUEST_PICK_IMAGE);
    } catch (Exception e) {
      pickImagePromise = null;
      promise.reject("failed", e);
    }
  }

  @Override
  public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
    if (requestCode != REQUEST_PICK_IMAGE) return;
    Promise promise = pickImagePromise;
    pickImagePromise = null;
    if (promise == null) return;
    if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
      promise.reject("canceled", "user canceled");
      return;
    }
    Uri uri = data.getData();
    try {
      String path = copyImageToPrivateStorage(uri);
      WritableMap result = Arguments.createMap();
      result.putString("path", path);
      promise.resolve(result);
    } catch (Exception e) {
      Log.w(TAG, "copy image failed", e);
      promise.reject("copy_failed", e);
    }
  }

  @Override
  public void onNewIntent(Intent intent) {
    // noop
  }

  private String copyImageToPrivateStorage(Uri uri) throws Exception {
    ReactApplicationContext ctx = getReactApplicationContext();
    String ext = "jpg";
    String mime = ctx.getContentResolver().getType(uri);
    if (mime != null) {
      if (mime.contains("png")) ext = "png";
      else if (mime.contains("webp")) ext = "webp";
      else if (mime.contains("gif")) ext = "gif";
      else if (mime.contains("jpeg") || mime.contains("jpg")) ext = "jpg";
    }
    File dir = new File(ctx.getFilesDir(), "custom_bg");
    if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdir failed: " + dir);
    File dest = new File(dir, "bg_" + System.currentTimeMillis() + "." + ext);
    InputStream input = null;
    FileOutputStream output = null;
    try {
      input = ctx.getContentResolver().openInputStream(uri);
      if (input == null) throw new Exception("openInputStream returned null");
      output = new FileOutputStream(dest);
      byte[] buffer = new byte[8192];
      int read;
      while ((read = input.read(buffer)) != -1) {
        output.write(buffer, 0, read);
      }
      output.flush();
    } finally {
      if (output != null) try { output.close(); } catch (Exception ignored) { }
      if (input != null) try { input.close(); } catch (Exception ignored) { }
    }
    return dest.getAbsolutePath();
  }

  // ------------------------------------------------------------------ 播报

  private void initTts() {
    if (tts != null || ttsInitializing) return;
    ttsInitializing = true;
    tts = new TextToSpeech(getReactApplicationContext(), status -> {
      ttsInitializing = false;
      if (status == TextToSpeech.SUCCESS && tts != null) {
        try {
          tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
          tts.setSpeechRate(1.0f);
        } catch (Exception ignored) { }
        ttsReady = true;
        if (pendingTtsText != null) {
          String text = pendingTtsText;
          pendingTtsText = null;
          speakNow(text, 1.0f);
        }
      } else {
        ttsReady = false;
        Log.w(TAG, "tts init failed: " + status);
      }
    });
  }

  @ReactMethod
  public void speak(String text, float rate, final Promise promise) {
    if (text == null || text.trim().isEmpty()) {
      promise.resolve(false);
      return;
    }
    initTts();
    if (!ttsReady) {
      // 引擎还在初始化，先缓存，避免丢播报
      pendingTtsText = text;
      promise.resolve(true);
      return;
    }
    speakNow(text, rate);
    promise.resolve(true);
  }

  private void speakNow(String text, float rate) {
    if (tts == null) return;
    try {
      tts.setSpeechRate(rate <= 0 ? 1.0f : rate);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lx_" + System.currentTimeMillis());
      } else {
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null);
      }
    } catch (Exception e) {
      Log.w(TAG, "speak failed", e);
    }
  }

  @ReactMethod
  public void stopSpeak(final Promise promise) {
    pendingTtsText = null;
    if (tts != null) {
      try {
        tts.stop();
      } catch (Exception ignored) { }
    }
    promise.resolve(true);
  }

  // --------------------------------------------------------------- 灵动岛

  @ReactMethod
  public void showIsland(ReadableMap options) {
    ReactApplicationContext ctx = getReactApplicationContext();
    String title = options.hasKey("title") ? options.getString("title") : "";
    String text = options.hasKey("text") ? options.getString("text") : "";
    String sub = options.hasKey("sub") ? options.getString("sub") : "";
    boolean playing = !options.hasKey("playing") || options.getBoolean("playing");
    int percent = options.hasKey("percent") ? options.getInt("percent") : -1;

    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // IMPORTANCE_LOW 会让通知失去被提升为 Live Update 的资格，这里用 DEFAULT 且静音
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ISLAND, "歌词灵动岛", NotificationManager.IMPORTANCE_DEFAULT);
      channel.setShowBadge(false);
      channel.setSound(null, null);
      channel.enableVibration(false);
      manager.createNotificationChannel(channel);
    }

    Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
    PendingIntent contentIntent = null;
    if (launch != null) {
      launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        : PendingIntent.FLAG_UPDATE_CURRENT;
      contentIntent = PendingIntent.getActivity(ctx, 0, launch, flags);
    }

    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder = new Notification.Builder(ctx, CHANNEL_ISLAND);
    } else {
      builder = new Notification.Builder(ctx);
    }
    builder.setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title)
      .setContentText(text)
      .setSubText(sub)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setWhen(System.currentTimeMillis());
    if (contentIntent != null) builder.setContentIntent(contentIntent);
    if (percent >= 0) {
      builder.setProgress(100, Math.max(0, Math.min(100, percent)), false);
    }
    // 展开后显示多行歌词
    Notification.BigTextStyle big = new Notification.BigTextStyle();
    big.setBigContentTitle(title);
    big.bigText(text);
    builder.setStyle(big);

    // Android 16 (API 36) 的 Live Update：提升为常驻进行中通知，
    // ColorOS 17 / 原生 Android 16 会把它渲染成灵动岛 / 流体云卡片。
    try {
      Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class)
        .invoke(builder, playing);
    } catch (Exception ignored) {
      // 低版本系统没有该 API，退化为普通常驻通知
    }
    // Android 16 的 Live Update 要求提供状态栏胶囊短文案，没有的话不会上岛
    try {
      Notification.Builder.class.getMethod("setShortCriticalText", String.class)
        .invoke(builder, text.isEmpty() ? title : text);
    } catch (Exception ignored) { }

    try {
      manager.notify(NOTIFICATION_ISLAND, builder.build());
    } catch (SecurityException e) {
      Log.w(TAG, "notify failed, notification permission missing", e);
    }
  }

  /**
   * 一起听房间消息通知
   * 用独立的高优先级渠道，带声音/震动，点击直接回到 App。
   */
  @ReactMethod
  public void showChatNotification(String title, String text) {
    ReactApplicationContext ctx = getReactApplicationContext();
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_CHAT, "一起听消息", NotificationManager.IMPORTANCE_HIGH);
      channel.enableVibration(true);
      channel.setShowBadge(true);
      manager.createNotificationChannel(channel);
    }

    Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
    PendingIntent contentIntent = null;
    if (launch != null) {
      launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        : PendingIntent.FLAG_UPDATE_CURRENT;
      contentIntent = PendingIntent.getActivity(ctx, 0, launch, flags);
    }

    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder = new Notification.Builder(ctx, CHANNEL_CHAT);
    } else {
      builder = new Notification.Builder(ctx);
    }
    builder.setSmallIcon(android.R.drawable.ic_dialog_email)
      .setContentTitle(title == null ? "" : title)
      .setContentText(text == null ? "" : text)
      .setAutoCancel(true)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis());
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setPriority(Notification.PRIORITY_HIGH);
      builder.setDefaults(Notification.DEFAULT_ALL);
    }
    if (contentIntent != null) builder.setContentIntent(contentIntent);

    Notification.BigTextStyle big = new Notification.BigTextStyle();
    big.setBigContentTitle(title == null ? "" : title);
    big.bigText(text == null ? "" : text);
    builder.setStyle(big);

    try {
      manager.notify(NOTIFICATION_CHAT, builder.build());
    } catch (SecurityException e) {
      Log.w(TAG, "chat notify failed, notification permission missing", e);
    }
  }

  @ReactMethod
  public void hideIsland() {
    ReactApplicationContext ctx = getReactApplicationContext();
    NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(NOTIFICATION_ISLAND);
  }

  @ReactMethod
  public void isNotificationEnabled(final Promise promise) {
    try {
      NotificationManager manager = (NotificationManager) getReactApplicationContext()
        .getSystemService(Context.NOTIFICATION_SERVICE);
      boolean enabled = manager != null && manager.areNotificationsEnabled();
      promise.resolve(enabled);
    } catch (Exception e) {
      promise.resolve(true);
    }
  }

  // ------------------------------------------------------------- lifecycle

  @Override
  public void onHostResume() { }

  @Override
  public void onHostPause() {
    // 离开前台不主动停 TTS，保持与播放器一致
  }

  @Override
  public void onHostDestroy() {
    if (tts != null) {
      try {
        tts.stop();
        tts.shutdown();
      } catch (Exception ignored) { }
      tts = null;
      ttsReady = false;
    }
  }

  @Override
  public void invalidate() {
    if (tts != null) {
      try {
        tts.stop();
        tts.shutdown();
      } catch (Exception ignored) { }
      tts = null;
      ttsReady = false;
    }
    super.invalidate();
  }
}
