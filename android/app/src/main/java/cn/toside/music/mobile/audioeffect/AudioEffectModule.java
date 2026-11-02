package cn.toside.music.mobile.audioeffect;

import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.PresetReverb;
import android.media.audiofx.Virtualizer;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;

/**
 * 音效模块（1.16.0）
 *
 * 基于 android.media.audiofx：Equalizer（多段均衡）+ BassBoost（低音增强）+
 * Virtualizer（环绕声场/立体声扩展，双扬声器完整利用）+ PresetReverb（混响：电影院/音乐厅等）。
 *
 * audioSession 传 0 = 全局输出混音（output mix），无需侵入 TrackPlayer 内部即可生效。
 * 需要 MODIFY_AUDIO_SETTINGS 权限；设备不支持某效果时静默失败并由 JS 层提示。
 */
public class AudioEffectModule extends ReactContextBaseJavaModule {

  private static final String TAG = "AudioEffect";
  private static final int AUDIO_SESSION_GLOBAL = 0;

  private final ReactApplicationContext reactContext;

  private Equalizer equalizer;
  private BassBoost bassBoost;
  private Virtualizer virtualizer;
  private PresetReverb reverb;
  private boolean effectEnabled = false;
  private short reverbPreset = PresetReverb.PRESET_NONE;

  public AudioEffectModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "AudioEffect";
  }

  private synchronized void ensureEffects() {
    if (equalizer == null) {
      try {
        equalizer = new Equalizer(0, AUDIO_SESSION_GLOBAL);
      } catch (Exception err) {
        Log.w(TAG, "equalizer unsupported: " + err);
      }
    }
    if (bassBoost == null) {
      try {
        bassBoost = new BassBoost(0, AUDIO_SESSION_GLOBAL);
      } catch (Exception err) {
        Log.w(TAG, "bassBoost unsupported: " + err);
      }
    }
    if (virtualizer == null) {
      try {
        virtualizer = new Virtualizer(0, AUDIO_SESSION_GLOBAL);
      } catch (Exception err) {
        Log.w(TAG, "virtualizer unsupported: " + err);
      }
    }
    if (reverb == null) {
      try {
        reverb = new PresetReverb(0, AUDIO_SESSION_GLOBAL);
      } catch (Exception err) {
        Log.w(TAG, "reverb unsupported: " + err);
      }
    }
  }

  /** 获取均衡器信息：频段数、各段中心频率(Hz)、电平范围(mB)、当前电平 */
  @ReactMethod
  public void getEqualizerInfo(Promise promise) {
    try {
      ensureEffects();
      if (equalizer == null) {
        promise.resolve(null);
        return;
      }
      WritableArray info = Arguments.createArray();
      short bands = equalizer.getNumberOfBands();
      short minLevel = equalizer.getBandLevelRange()[0];
      short maxLevel = equalizer.getBandLevelRange()[1];
      info.pushInt(bands);
      info.pushInt(minLevel);
      info.pushInt(maxLevel);
      for (short i = 0; i < bands; i++) {
        // 中心频率返回单位是毫赫兹(mHz)，换算成 Hz
        int centerHz = equalizer.getCenterFreq(i) / 1000;
        info.pushInt(centerHz);
        info.pushInt(equalizer.getBandLevel(i));
      }
      promise.resolve(info);
    } catch (Exception err) {
      promise.reject("EQ_INFO_FAILED", err);
    }
  }

  /** 启用音效（按已保存的设置逐项应用后统一 enable） */
  @ReactMethod
  public void enable(Promise promise) {
    try {
      ensureEffects();
      applyReverbPreset(reverbPreset);
      setEnabled(true);
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("EFFECT_FAILED", err);
    }
  }

  /** 关闭并释放全部音效 */
  @ReactMethod
  public void disable(Promise promise) {
    try {
      setEnabled(false);
      releaseEffects();
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("EFFECT_FAILED", err);
    }
  }

  private synchronized void setEnabled(boolean enabled) {
    effectEnabled = enabled;
    try { if (equalizer != null) equalizer.setEnabled(enabled); } catch (Exception ignored) {}
    try { if (bassBoost != null) bassBoost.setEnabled(enabled); } catch (Exception ignored) {}
    try { if (virtualizer != null) virtualizer.setEnabled(enabled); } catch (Exception ignored) {}
    try { if (reverb != null) reverb.setEnabled(enabled); } catch (Exception ignored) {}
  }

  private synchronized void releaseEffects() {
    try { if (equalizer != null) equalizer.release(); } catch (Exception ignored) {}
    try { if (bassBoost != null) bassBoost.release(); } catch (Exception ignored) {}
    try { if (virtualizer != null) virtualizer.release(); } catch (Exception ignored) {}
    try { if (reverb != null) reverb.release(); } catch (Exception ignored) {}
    equalizer = null;
    bassBoost = null;
    virtualizer = null;
    reverb = null;
  }

  /** 设置某个均衡器频段电平（毫贝，范围见 getEqualizerInfo） */
  @ReactMethod
  public void setBandLevel(int band, int level, Promise promise) {
    try {
      ensureEffects();
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      equalizer.setBandLevel((short) band, (short) level);
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("EQ_FAILED", err);
    }
  }

  /** 低音增强强度 0 ~ 100 */
  @ReactMethod
  public void setBassBoost(int strength, Promise promise) {
    try {
      ensureEffects();
      if (bassBoost == null) {
        promise.resolve(false);
        return;
      }
      bassBoost.setStrength((short) Math.max(0, Math.min(100, strength)));
      if (effectEnabled) bassBoost.setEnabled(true);
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("BASS_FAILED", err);
    }
  }

  /** 环绕声场（立体声扩展）强度 0 ~ 100 */
  @ReactMethod
  public void setVirtualizer(int strength, Promise promise) {
    try {
      ensureEffects();
      if (virtualizer == null) {
        promise.resolve(false);
        return;
      }
      virtualizer.setStrength((short) Math.max(0, Math.min(100, strength)));
      if (effectEnabled) virtualizer.setEnabled(true);
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("VIRTUAL_FAILED", err);
    }
  }

  /** 混响预设：none / smallroom / mediumroom / largeroom / mediumhall / largehall / plate */
  @ReactMethod
  public void setReverb(String preset, Promise promise) {
    try {
      ensureEffects();
      reverbPreset = toReverbPreset(preset);
      applyReverbPreset(reverbPreset);
      promise.resolve(true);
    } catch (Exception err) {
      promise.reject("REVERB_FAILED", err);
    }
  }

  private synchronized void applyReverbPreset(short preset) {
    try {
      if (reverb == null) return;
      reverb.setPreset(preset);
      if (effectEnabled) reverb.setEnabled(true);
    } catch (Exception ignored) {}
  }

  private static short toReverbPreset(String preset) {
    if (preset == null) return PresetReverb.PRESET_NONE;
    switch (preset) {
      case "smallroom": return PresetReverb.PRESET_SMALLROOM;
      case "mediumroom": return PresetReverb.PRESET_MEDIUMROOM;
      case "largeroom": return PresetReverb.PRESET_LARGEROOM;
      case "mediumhall": return PresetReverb.PRESET_MEDIUMHALL;
      case "largehall": return PresetReverb.PRESET_LARGEHALL;
      case "plate": return PresetReverb.PRESET_PLATE;
      default: return PresetReverb.PRESET_NONE;
    }
  }

  @Override
  public void invalidate() {
    super.invalidate();
    releaseEffects();
  }
}
