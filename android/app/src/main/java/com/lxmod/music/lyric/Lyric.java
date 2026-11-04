package com.lxmod.music.lyric;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Objects;

public class Lyric extends LyricPlayer {
  LyricView lyricView = null;
  LyricEvent lyricEvent = null;
  ReactApplicationContext reactAppContext;

  boolean isRunPlayer = false;
  // String lastText = "LX Music ^-^";
  int lastLine = 0;
  HashMap lastLineMap = null;
  List lines = new ArrayList();
  boolean isShowTranslation;
  boolean isShowRoma;
  boolean isShowLyricView = false;
  boolean isSendLyricTextEvent = false;
  boolean isScreenOff = false;
  String lyricText = "";
  String translationText = "";
  String romaLyricText = "";
  String wordLyricText = "";

  Lyric(ReactApplicationContext reactContext, boolean isShowTranslation, boolean isShowRoma, float playbackRate) {
    this.reactAppContext = reactContext;
    this.isShowTranslation = isShowTranslation;
    this.isShowRoma = isShowRoma;
    this.playbackRate = playbackRate;
    registerScreenBroadcastReceiver();
    // checkA2DPConnection(reactContext);
  }

  private void registerScreenBroadcastReceiver() {
    final IntentFilter theFilter = new IntentFilter();
    /** System Defined Broadcast */
    theFilter.addAction(Intent.ACTION_SCREEN_ON);
    theFilter.addAction(Intent.ACTION_SCREEN_OFF);

    BroadcastReceiver screenOnOffReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        String strAction = intent.getAction();

        switch (Objects.requireNonNull(strAction)) {
          case Intent.ACTION_SCREEN_OFF:
            Log.d("Lyric", "ACTION_SCREEN_OFF");
            handleScreenOff();
            break;
          case Intent.ACTION_SCREEN_ON:
            Log.d("Lyric", "ACTION_SCREEN_ON");
            handleScreenOn();
            break;
        }
      }
    };

    reactAppContext.registerReceiver(screenOnOffReceiver, theFilter);
  }

  // private void checkA2DPConnection(Context context) {
  //   BluetoothAdapter bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();

  //   if (bluetoothAdapter != null && bluetoothAdapter.isEnabled()) {
  //     bluetoothAdapter.getProfileProxy(context, new BluetoothProfile.ServiceListener() {
  //       @Override
  //       public void onServiceConnected(int profile, BluetoothProfile proxy) {
  //         if (profile == BluetoothProfile.A2DP) {
  //           List<BluetoothDevice> connectedDevices = proxy.getConnectedDevices();
  //           if (!connectedDevices.isEmpty()) {
  //             System.out.println("已连接的 A2DP 媒体设备：");
  //             for (BluetoothDevice device : connectedDevices) {
  //               System.out.println("设备名称: " + "地址: " + device.getAddress());
  //             }
  //           } else {
  //             System.out.println("没有连接的 A2DP 媒体设备");
  //           }
  //         }
  //         bluetoothAdapter.closeProfileProxy(profile, proxy);
  //       }

  //       @Override
  //       public void onServiceDisconnected(int profile) {
  //         // 服务断开时的处理
  //         System.out.println("蓝牙服务断开时的处理");
  //       }
  //     }, BluetoothProfile.A2DP);
  //   } else {
  //     System.out.println("蓝牙未开启或设备不支持蓝牙");
  //   }
  // }

  private boolean isDisableAutoPause() {
    return !isRunPlayer || isSendLyricTextEvent;
  }
  private void handleScreenOff() {
    isScreenOff = true;
    if (isDisableAutoPause()) return;
    setTempPause(true);
  }

  private void handleScreenOn() {
    isScreenOff = false;
    if (isDisableAutoPause()) return;
    if (lyricView == null) {
      lyricView = new LyricView(reactAppContext, lyricEvent);
      lyricView.setKaraokeClock(new LyricTextView.KaraokeClock() {
        @Override
        public int now() { return getCurrentTime(); }

        @Override
        public boolean playing() { return isPlaying(); }
      });
    }
    lyricView.runOnUiThread(() -> {
      handleGetCurrentLyric(lastLine);
      setTempPause(false);
    });
  }

  private void pausePlayer() {
    if (!isRunPlayer || isShowLyricView || isSendLyricTextEvent) return;
    isRunPlayer = false;
    this.pause();
  }

  private void setCurrentLyric(String lyric, ArrayList<String> extendedLyrics) {
    if (isShowLyricView && !isScreenOff && lyricView != null) {
      lyricView.setLyric(lyric, extendedLyrics, lastLineMap == null ? null : (ArrayList<long[]>) lastLineMap.get("words"));
    }
    if (isSendLyricTextEvent) {
      WritableMap params = Arguments.createMap();
      params.putString("text", lyric);
      params.putArray("extendedLyrics", Arguments.makeNativeArray(extendedLyrics));
      lyricEvent.sendEvent(lyricEvent.LYRIC_Line_PLAY, params);
    }
  }
  @SuppressWarnings("unchecked")
  private void handleGetCurrentLyric(int lineNum) {
    lastLine = lineNum;
    lastLineMap = lineNum >= 0 && lineNum < lines.size() ? (HashMap) lines.get(lineNum) : null;
    if (lastLineMap != null) {
      setCurrentLyric((String) lastLineMap.get("text"), (ArrayList<String>) lastLineMap.get("extendedLyrics"));
      return;
    }
    setCurrentLyric("", new ArrayList<>(0));
  }

  public void setSendLyricTextEvent(boolean isSend) {
    if (isSendLyricTextEvent == isSend) return;
    isSendLyricTextEvent = isSend;
    if (isSend) {
      if (lyricEvent == null) lyricEvent = new LyricEvent(reactAppContext);
      isRunPlayer = true;
    } else {
      pausePlayer();
    }
  }

  public void showDesktopLyric(Bundle options, Promise promise) {
    // 窗口已存在就直接复用，不重建：
    // 重建会丢掉用户拖好的位置、锁定状态，并让歌词闪一下。
    // 但必须 resolve —— 原实现是「直接 return」，Promise 既不 resolve 也不 reject，
    // JS 侧 `await showDesktopLyricView()` 永久挂起，后面的 setLyric 永远执行不到。
    if (isShowLyricView && lyricView != null) {
      promise.resolve(null);
      return;
    }
    if (lyricEvent == null) lyricEvent = new LyricEvent(reactAppContext);
    if (lyricView == null) {
      lyricView = new LyricView(reactAppContext, lyricEvent);
      lyricView.setKaraokeClock(new LyricTextView.KaraokeClock() {
        @Override
        public int now() { return getCurrentTime(); }

        @Override
        public boolean playing() { return isPlaying(); }
      });
    }
    try {
      lyricView.showLyricView(options);
    } catch (Exception e) {
      // 失败必须回滚状态，否则后续所有 show 都会走进「已显示」分支
      isShowLyricView = false;
      try {
        lyricView.destroy();
      } catch (Exception ignored) {
      }
      lyricView = null;
      promise.reject(e);
      Log.e("Lyric", String.valueOf(e.getMessage()));
      return;
    }
    isShowLyricView = true;
    isRunPlayer = true;
    // 窗口刚建好，先用已经解析好的当前行刷一次：JS 那次 setLyric 通常紧随其后，
    // 但权限弹窗、JS 线程忙时会晚到几百毫秒，这段时间屏幕上会挂一个空白悬浮窗。
    if (!lines.isEmpty()) handleGetCurrentLyric(lastLine);
    promise.resolve(null);
  }

  public void hideDesktopLyric() {
    if (!isShowLyricView) return;
    isShowLyricView = false;
    pausePlayer();
    if (lyricView != null) {
      // destroy 内部已是安全移除，这里再兜一层，防止厂商 ROM 提前回收悬浮窗后抛异常
      try {
        lyricView.destroy();
      } catch (Exception ignored) {
      }
      lyricView = null;
    }
  }

  private void refreshLyric() {
    if (!isRunPlayer) return;
    ArrayList<String> extendedLyrics = new ArrayList<>(2);
    if (isShowTranslation && !"".equals(translationText)) extendedLyrics.add(translationText);
    if (isShowRoma && !"".equals(romaLyricText)) extendedLyrics.add(romaLyricText);
    // super.setLyric 会先 pause() 再重新解析整首歌词，并同步回调 onSetLyric →
    // handleGetCurrentLyric(-1)，把当前行清空。切翻译/音译开关、切歌都会走到这里，
    // 不恢复的话现象就是：一开或一关翻译，桌面歌词立刻变空白；而且播放器已经被
    // pause 掉，后面再也不会跳行，必须重新开关一次才能恢复。
    boolean wasPlaying = isPlay;
    int resumeTime = 0;
    if (wasPlaying) {
      // getCurrentTime() 已经把 [offset:] 标签和内置的 150ms 补偿算进去了，
      // 直接把它回传给 play() 会再叠一次，切几次翻译开关歌词就会越跑越快。
      Object tagOffset = tags.get("offset");
      int tagOffsetMs = tagOffset instanceof Number ? ((Number) tagOffset).intValue() : 0;
      resumeTime = getCurrentTime() - tagOffsetMs - offset;
      if (resumeTime < 0) resumeTime = 0;
    }
    int prevLine = lastLine;
    super.setLyric(lyricText, extendedLyrics, wordLyricText);
    if (wasPlaying) play(resumeTime);
    else handleGetCurrentLyric(prevLine);
  }

  public void setLyric(String lyric, String translation, String romaLyric) {
    setLyric(lyric, translation, romaLyric, null);
  }

  public void setLyric(String lyric, String translation, String romaLyric, String wordLyric) {
    lyricText = lyric;
    translationText = translation;
    romaLyricText = romaLyric;
    wordLyricText = wordLyric == null ? "" : wordLyric;
    refreshLyric();
  }

  @Override
  public void onSetLyric(List lines) {
    this.lines = lines;
    // 重新解析完不要立刻清空当前行：refreshLyric 返回后会按原进度重新对齐，
    // 中间清一次会让悬浮窗的文字和高度闪一下（切翻译开关时尤其明显）。
    // 只有歌词真的被清空（停止播放）时才清屏。
    if (lines.isEmpty()) handleGetCurrentLyric(-1);
    // for (int i = 0; i < lines.size(); i++) {
    //   HashMap line = (HashMap) lines.get(i);
    //   Log.d("Lyric", "onSetLyric: " +(String) line.get("text") + " " + line.get("extendedLyrics"));
    // }
  }

  @Override
  public void onPlay(int lineNum) {
    handleGetCurrentLyric(lineNum);
    // Log.d("Lyric", lineNum + " " + text + " " + (String) line.get("translation"));
  }

  public void pauseLyric() {
    pause();
    // 暂停时保留当前这一句，不要清空。
    // 之前这里调用 handleGetCurrentLyric(-1)，一暂停桌面歌词就变成空白，
    // 想暂停下来看着歌词听一会儿就没得看了。
    // pause() 内部已经按当前时间对齐过行，这里无需再处理；
    // 真正停止播放（切歌/停止）走的是 setLyric("")，那条路径会正常清空。
  }

  /**
   * 歌词播放到结尾：保留最后一句文本并保持已唱高亮，只停掉逐字动画。
   *
   * 注意不能把 lastLine 置为 -1：息屏/亮屏回调会调用 handleGetCurrentLyric(lastLine)，
   * 一旦是 -1，末行会被当成「无歌词」清空 —— 表现为开关屏后最后一句消失。
   */
  @Override
  public void onLyricFinish() {
    if (lyricView != null) lyricView.finishCurrentLine();
  }

  public void lockLyric() {
    if (lyricView == null) return;
    lyricView.lockView();
  }

  public void unlockLyric() {
    if (lyricView == null) return;
    lyricView.unlockView();
  }

  public void setMaxLineNum(int maxLineNum) {
    if (lyricView == null) return;
    lyricView.setMaxLineNum(maxLineNum);
  }

  public void setWidth(int width) {
    if (lyricView == null) return;
    lyricView.setWidth(width);
  }

  public void setPosition(float x, float y) {
    if (lyricView == null) return;
    lyricView.setPosition(x, y);
  }

  public void setSingleLine(boolean singleLine) {
    if (lyricView == null) return;
    lyricView.setSingleLine(singleLine);
  }

  public void setShowToggleAnima(boolean showToggleAnima) {
    if (lyricView == null) return;
    lyricView.setShowToggleAnima(showToggleAnima);
  }

  public void toggleTranslation(boolean isShowTranslation) {
    this.isShowTranslation = isShowTranslation;
    refreshLyric();
  }

  public void toggleRoma(boolean isShowRoma) {
    this.isShowRoma = isShowRoma;
    refreshLyric();
  }

  public void setPlayedColor(String unplayColor, String playedColor, String shadowColor) {
    if (lyricView == null) return;
    lyricView.setColor(unplayColor, playedColor, shadowColor);
  }

  public void setAlpha(float alpha) {
    if (lyricView == null) return;
    lyricView.setAlpha(alpha);
  }

  public void setTextSize(float size) {
    if (lyricView == null) return;
    lyricView.setTextSize(size);
  }

  public void setLyricTextPosition(String positionX, String positionY) {
    if (lyricView == null) return;
    lyricView.setLyricTextPosition(positionX, positionY);
  }
}
