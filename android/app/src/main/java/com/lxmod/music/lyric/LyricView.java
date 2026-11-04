package com.lxmod.music.lyric;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.WindowManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.lxmod.music.R;

public class LyricView extends Activity implements View.OnTouchListener {
  LyricSwitchView textView = null;
  WindowManager windowManager = null;
  WindowManager.LayoutParams layoutParams = null;
  final private ReactApplicationContext reactContext;
  final private LyricEvent lyricEvent;

  // private int winWidth = 0;

  private float lastX; //上一次位置的X.Y坐标
  private float lastY;
  private float nowX;  //当前移动位置的X.Y坐标
  private float nowY;
  private float tranX; //悬浮窗移动位置的相对值
  private float tranY;
  private float prevViewPercentageX = 0;
  private float prevViewPercentageY = 0;
  private float widthPercentage = 1f;

  private float preY = 0;
  // private static boolean isVibrated = false;

  private boolean isLock = false;
  private boolean isSingleLine = false;
  private boolean isShowToggleAnima = false;
  private String unplayColor = "rgba(255, 255, 255, 1)";
  private String playedColor = "rgba(7, 197, 86, 1)";
  private String shadowColor = "rgba(0, 0, 0, 0.15)";
  // private String lastText = "LX Music ^-^";
  private String textX = "LEFT";
  private String textY = "TOP";
  private float alpha = 1f;
  private float textSize = 18f;
  private int maxWidth = 0;
  private int maxHeight = 0;

  private int maxLineNum = 5;
  // private float lineHeight = 1;
  // 未拿到歌词时窗口保持空白，不再显示「LX Music ^-^」这类占位文本：
  // 占位文本会让用户误以为歌词同步失败，且窗口即使只有一行也会挡住下层界面。
  private String currentLyric = "";
  private ArrayList<long[]> currentWords = null;
  private LyricTextView.KaraokeClock karaokeClock = null;

  public void setKaraokeClock(LyricTextView.KaraokeClock clock) {
    this.karaokeClock = clock;
    if (textView != null) textView.setKaraokeClock(clock);
  }
  private ArrayList<String> currentExtendedLyrics = new ArrayList<>();

  private int mLastRotation;
  private OrientationEventListener orientationEventListener = null;

  final Handler fixViewPositionHandler;
  final Runnable fixViewPositionRunnable = this::updateViewPosition;

  LyricView(ReactApplicationContext reactContext, LyricEvent lyricEvent) {
    this.reactContext = reactContext;
    this.lyricEvent = lyricEvent;
    fixViewPositionHandler = new Handler();
  }

  private void listenOrientationEvent() {
    if (orientationEventListener == null) {
      orientationEventListener = new OrientationEventListener(reactContext, SensorManager.SENSOR_DELAY_NORMAL) {
        @Override
        public void onOrientationChanged(int orientation) {
          // 窗口已经销毁（关歌词/权限被收回）时传感器回调可能还在飞，
          // 这里不判空会直接 NPE 崩在主线程
          if (windowManager == null) return;
          Display display = windowManager.getDefaultDisplay();
          int rotation = display.getRotation();
          if(rotation != mLastRotation){
            //rotation changed
            // if (rotation == Surface.ROTATION_90){} // check rotations here
            // if (rotation == Surface.ROTATION_270){} //
            // Log.d("Lyric", "rotation: " + rotation);
            fixViewPositionHandler.postDelayed(fixViewPositionRunnable, 300);
          }
          mLastRotation = rotation;
        }
      };
    }
    // Log.d("Lyric", "orientationEventListener: " + orientationEventListener.canDetectOrientation());
    if (orientationEventListener.canDetectOrientation()) {
      orientationEventListener.enable();
    }
  }
  private void removeOrientationEvent() {
    if (orientationEventListener == null) return;
    orientationEventListener.disable();
    // orientationEventListener = null;
  }

  private int getLayoutParamsFlags() {
    int flag = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL |
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

    if (isLock) {
      flag = flag | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
    }

    return flag;
  }

  /**
   * update screen width and height
   * @return has updated
   */
  private boolean updateWH() {
    Display display = windowManager.getDefaultDisplay();
    Point size = new Point();
    display.getRealSize(size);
    if (maxWidth == size.x && maxHeight == size.y) return false;
    maxWidth = size.x;
    maxHeight = size.y;
    return true;
  }

  /**
   * 实际要显示的行数：1 行主歌词 + 最多 (maxLineNum - 1) 行翻译/音译。
   *
   * 不能用 maxLineNum 直接乘主行高，也不能只看 currentLyric 是否为空：
   * 翻译行是 0.64 倍字号，高度和主行不一样，按主行高乘行数会让窗口底部
   * 空出一大片透明区域，既挡住下层点击（ColorOS 会弹悬浮遮挡提示），
   * 又让「歌词到底显示在第几行」看起来很怪。
   */
  private int displayLineCount() {
    int lines = 1;
    if (currentLyric == null || currentLyric.length() == 0) return lines;
    if (isSingleLine || maxLineNum <= 1) return lines;
    if (currentExtendedLyrics != null) {
      for (String lrc : currentExtendedLyrics) {
        if (lrc == null || lrc.isEmpty()) continue;
        if (++lines >= maxLineNum) break;
      }
    }
    return lines;
  }

  private void setLayoutParamsHeight() {
    if (textView == null || layoutParams == null) return;
    int mainLineHeight = 60;
    if (textView.getPaint() != null) {
      int h = textView.getPaint().getFontMetricsInt(null);
      if (h > 0) mainLineHeight = h;
    }
    // 与 LyricTextView.TRANSLATION_SCALE 保持一致
    int transLineHeight = Math.max(1, (int)Math.ceil(mainLineHeight * 0.64f));
    int lines = displayLineCount();
    // 多行时给 4px 余量：这里是按字号估算行高，实际 FontMetrics 会略大一点点，
    // 不留余量的话翻译行底部会被窗口裁掉一条。
    int height = mainLineHeight + (lines - 1) * transLineHeight + (lines > 1 ? 4 : 0);
    int maxAllowed = maxHeight - 100;
    if (maxAllowed < mainLineHeight) maxAllowed = mainLineHeight;
    if (height > maxAllowed) height = maxAllowed;
    layoutParams.height = height;
    textView.setHeight(height);
  }

  private void fixViewPosition() {
    int maxX = maxWidth - layoutParams.width;
    int x = (int)(maxWidth * prevViewPercentageX);
    if (x < 0) x = 0;
    else if (x > maxX) x = maxX;
    if (layoutParams.x != x) layoutParams.x = x;

    setLayoutParamsHeight();

    int maxY = maxHeight - layoutParams.height;
    int y = (int)(maxHeight * prevViewPercentageY);
    if (y < 0) y = 0;
    else if (y > maxY) y = maxY;
    if (layoutParams.y != y) layoutParams.y = y;
  }

  private void updateViewPosition() {
    if (windowManager == null || layoutParams == null) return;
    if (!updateWH()) return;

    int width = (int)(maxWidth * widthPercentage);
    if (layoutParams.width != width) {
      layoutParams.width = width;
      if (textView != null) textView.setWidth(width);
    }

    fixViewPosition();
    // Log.d("Lyric", "widthPercentage: " + widthPercentage + "  prevViewPercentageX: " + prevViewPercentageX);
    // Log.d("Lyric", "prevViewPercentageY: " + prevViewPercentageY + "  layoutParams.x: " + layoutParams.x);
    // Log.d("Lyric", "layoutParams.y: " + layoutParams.y + "  layoutParams.width: " + layoutParams.width);

    safeUpdateViewLayout();
  }

  public void sendPositionEvent(float x, float y) {
    WritableMap params = Arguments.createMap();
    params.putDouble("x", x);
    params.putDouble("y", y);
    lyricEvent.sendEvent(lyricEvent.SET_VIEW_POSITION, params);
  }

//  public void permission(){
//    if (Build.VERSION.SDK_INT >= 23) {
//      if(!Settings.canDrawOverlays(this)) {
//        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
//        startActivity(intent);
//        return;
//      } else {
//        //Android6.0以上
//        if (mFloatView!=null && mFloatView.isShow()==false) {
//          mFloatView.show();
//        }
//      }
//    } else {
//      //Android6.0以下，不用动态声明权限
//      if (mFloatView!=null && mFloatView.isShow()==false) {
//        mFloatView.show();
//      }
//    }
//  }
// boolean isLock, String themeColor, float alpha, int lyricViewX, int lyricViewY, String textX, String textY
  public void showLyricView(Bundle options) {
    isLock = options.getBoolean("isLock", isLock);
    isSingleLine = options.getBoolean("isSingleLine", isSingleLine);
    isShowToggleAnima = options.getBoolean("isShowToggleAnima", isShowToggleAnima);
    unplayColor = options.getString("unplayColor", unplayColor);
    playedColor = options.getString("playedColor", playedColor);
    shadowColor = options.getString("shadowColor", shadowColor);
    prevViewPercentageX = (float) options.getDouble("lyricViewX", 0f) / 100f;
    prevViewPercentageY = (float) options.getDouble("lyricViewY", 0f) / 100f;
    textX = options.getString("textX", textX);
    textY = options.getString("textY", textY);
    alpha = (float) options.getDouble("alpha", alpha);
    textSize = (float) options.getDouble("textSize", textSize);
    widthPercentage = (float) options.getDouble("width", 100) / 100f;
    maxLineNum = (int) options.getDouble("maxLineNum", maxLineNum);
    handleShowLyric();
    listenOrientationEvent();
  }
  public void showLyricView() {
    try {
      handleShowLyric();
    } catch (Exception e) {
      Log.e("Lyric", e.getMessage());
      return;
    }
    listenOrientationEvent();
  }
  public static int parseColor(String input) {
    if (input.startsWith("#")) return Color.parseColor(input);
    Pattern c = Pattern.compile("rgba? *\\( *(\\d+), *(\\d+), *(\\d+)(?:, *([\\d.]+))? *\\)");
    Matcher m = c.matcher(input);
    if (m.matches()) {
      int red = Integer.parseInt(m.group(1));
      int green = Integer.parseInt(m.group(2));
      int blue = Integer.parseInt(m.group(3));
      float a = 1;
      if (m.group(4) != null) a = Float.parseFloat(m.group(4));
      return Color.argb((int) (a * 255), red, green, blue);
    }
    return Color.parseColor("#000000");
  }

  /**
   * 组装要交给 LyricTextView 绘制的完整文本：第一行主歌词，其余行是翻译/音译。
   *
   * 单行模式刻意不拼翻译：
   * - 窗口只有一行高，拼进来的翻译根本画不出来；
   * - 更糟的是 LyricTextView 按「主行 + 翻译行」总高度做垂直居中，
   *   多出一行会把主歌词整体顶上去，看起来像位置错了。
   * 多行模式最多补满 maxLineNum - 1 行。
   */
  private String buildDisplayText(String text, ArrayList<String> extendedLyrics) {
    if (text == null) text = "";
    if (extendedLyrics == null || extendedLyrics.isEmpty()) return text;
    if (isSingleLine || maxLineNum <= 1 || text.isEmpty()) return text;
    int num = maxLineNum - 1;
    StringBuilder textBuilder = new StringBuilder(text);
    for (String lrc : extendedLyrics) {
      if (lrc == null || lrc.isEmpty()) continue;
      textBuilder.append("\n").append(lrc);
      if (--num < 1) break;
    }
    return textBuilder.toString();
  }

  private void createTextView() {
    textView = new LyricSwitchView(reactContext, isSingleLine, isShowToggleAnima);
    if (karaokeClock != null) textView.setKaraokeClock(karaokeClock);
    // 只设一次：TextSwitcher 每 setText 一次都会走一遍切换动画，
    // 先设空再设有内容会让打开/重建窗口时闪两下。
    textView.setText(buildDisplayText(currentLyric, currentExtendedLyrics));

    textView.setTextColor(parseColor(playedColor));
    textView.setPlayedPaintColor(parseColor(playedColor));
    textView.setUnplayedPaintColor(parseColor(unplayColor));
    textView.setShadowColor(parseColor(shadowColor));
    textView.setAlpha(alpha);
    textView.setTextSize(textSize);
    // Log.d("Lyric", "alpha: " + alpha + " text size: " + textSize);

    //监听 OnTouch 事件 为了实现"移动歌词"功能
    textView.setOnTouchListener(this);

    int textPositionX;
    int textPositionY;
    switch (textX) {
      case "CENTER":
        textPositionX = Gravity.CENTER;
        break;
      case "RIGHT":
        textPositionX = Gravity.END;
        break;
      case "Left":
      default:
        textPositionX = Gravity.START;
        break;
    }
    switch (textY) {
      case "CENTER":
        textPositionY = Gravity.CENTER;
        break;
      case "BOTTOM":
        textPositionY = Gravity.BOTTOM;
        break;
      case "TOP":
      default:
        textPositionY = Gravity.TOP;
        break;
    }
    textView.setGravity(textPositionX | textPositionY);

    if (!isSingleLine) {
      textView.setMaxLines(maxLineNum);
    }
  }
  private void handleShowLyric() {
    if (windowManager == null) {
      windowManager = (WindowManager) reactContext.getSystemService(Context.WINDOW_SERVICE);
      //设置TextView的属性
      layoutParams = new WindowManager.LayoutParams();

      DisplayMetrics outMetrics = new DisplayMetrics();
      windowManager.getDefaultDisplay().getMetrics(outMetrics);
      // winWidth = (int)(outMetrics.widthPixels * 0.92);
    }

    // 注意，悬浮窗只有一个，而当打开应用的时候才会产生悬浮窗，所以要判断悬浮窗是否已经存在
    if (textView != null) {
      safeRemoveView();
    }

    // 使用Application context
    // 创建UI控件，避免Activity销毁导致上下文出现问题,因为现在的悬浮窗是系统级别的，不依赖与Activity存在
    //创建自定义的TextView
    createTextView();

    // layoutParams.type = WindowManager.LayoutParams.TYPE_SYSTEM_ALERT | WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY;
    // layoutParams.type = WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY;
    layoutParams.type = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ?
      WindowManager.LayoutParams.TYPE_SYSTEM_ALERT :
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
    // 给窗口一个明确标题，系统「悬浮窗管理 / 遮挡提示」里能认出是歌词而不是异常弹窗
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      layoutParams.setTitle("LX Mod 桌面歌词");
    }

    // layoutParams.flags = isLock
    //  ? WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    //  : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
    layoutParams.flags = getLayoutParamsFlags();
    if (isLock) {
      textView.setBackgroundColor(Color.TRANSPARENT);

      // 修复 Android 12 的穿透点击问题
      if (Build.VERSION.SDK_INT > Build.VERSION_CODES.R) {
        layoutParams.alpha = 0.8f;
      }
    } else {
      textView.setBackgroundResource(R.drawable.rounded_corner);

      if (Build.VERSION.SDK_INT > Build.VERSION_CODES.R) {
        layoutParams.alpha = 1.0f;
      }
    }

    // TYPE_SYSTEM_ALERT  系统提示,它总是出现在应用程序窗口之上
    // TYPE_SYSTEM_OVERLAY   系统顶层窗口。显示在其他一切内容之上。此窗口不能获得输入焦点，否则影响锁屏
    // FLAG_NOT_FOCUSABLE 悬浮窗口较小时，后面的应用图标由不可长按变为可长按,不设置这个flag的话，home页的划屏会有问题
    // FLAG_NOT_TOUCH_MODAL不阻塞事件传递到后面的窗口
    layoutParams.gravity = Gravity.TOP | Gravity.START;  //显示在屏幕上中部

    updateWH();

    //悬浮窗的宽高
    // layoutParams.width = WindowManager.LayoutParams.WRAP_CONTENT;
    // layoutParams.height = WindowManager.LayoutParams.WRAP_CONTENT;
    // layoutParams.width= DisplayUtil.dp2px(mContext,55);
    // layoutParams.height= DisplayUtil.dp2px(mContext,55);
    layoutParams.width = (int)(maxWidth * widthPercentage);
    textView.setWidth(layoutParams.width);
    setLayoutParamsHeight();

    //显示位置与指定位置的相对位置差
    layoutParams.x = (int)(maxWidth * prevViewPercentageX);
    layoutParams.y = (int)(maxHeight * prevViewPercentageY);

    fixViewPosition();

    //设置透明
    layoutParams.format = PixelFormat.TRANSPARENT;

    //添加到window中。重复 add 会抛 IllegalStateException / BadTokenException，
    //先清一次再加，避免「快速开关歌词」时抛到 JS 层变成闪退
    try {
      windowManager.addView(textView, layoutParams);
    } catch (Exception e) {
      // 窗口已存在（快速开关歌词）、权限被收回、token 失效都会走到这里
      Log.e("Lyric", "addView failed: " + e.getMessage());
      safeRemoveView();
      try {
        windowManager.addView(textView, layoutParams);
      } catch (Exception e2) {
        // 二次仍失败：交给上层 reject + 回滚 isShowLyricView，
        // 否则会留下一个「状态说已显示、屏幕上什么都没有」的幽灵状态
        textView = null;
        throw new IllegalStateException("add lyric view failed", e2);
      }
    }
  }

  public void setLyric(String text, ArrayList<String> extendedLyrics) {
    setLyric(text, extendedLyrics, null);
  }

  /**
   * 歌词播放结束：保留末行文本与逐字数据，只把该行标记为「已唱完」。
   * 不能清空 currentWords —— 清空后重新 seek 回末行时逐字高亮会丢失。
   */
  public void finishCurrentLine() {
    if (textView != null) textView.setLineFinished(true);
  }

  public void setLyric(String text, ArrayList<String> extendedLyrics, ArrayList<long[]> words) {
    if (text == null) text = "";
    if (extendedLyrics == null) extendedLyrics = new ArrayList<>(0);
    int oldLines = displayLineCount();
    boolean sameContent = text.equals(currentLyric) && extendedLyrics.equals(currentExtendedLyrics);
    currentLyric = text;
    currentExtendedLyrics = extendedLyrics;
    currentWords = words;
    if (textView == null) return;
    // 新的一行进来，先解除上一行的「已唱完」状态
    textView.setLineFinished(false);
    textView.setKaraokeWords(currentWords);
    // 同一行重复下发（暂停、拖动进度回到本行）：只更新逐字数据，不重设文本，
    // 否则 TextSwitcher 会走一遍切换动画，看起来像歌词抖了一下。
    if (!sameContent) textView.setText(buildDisplayText(text, extendedLyrics));
    // 只在「显示行数」真的变化时改窗口高度（0 行 <-> 1 行、1 行 <-> 带翻译的多行），
    // 每句歌词都改高度会让悬浮窗上下抖。
    if (oldLines != displayLineCount() && layoutParams != null && windowManager != null) {
      setLayoutParamsHeight();
      safeUpdateViewLayout();
    }
  }

  /**
   * 按百分比设置窗口位置（JS 端 setDesktopLyricPosition 调用）。
   * 此前 JS 侧声明了 setPosition 但原生没有对应方法，调用即 TypeError。
   */
  public void setPosition(float percentageX, float percentageY) {
    if (Float.isNaN(percentageX)) percentageX = 0;
    if (Float.isNaN(percentageY)) percentageY = 0;
    prevViewPercentageX = Math.max(0f, Math.min(1f, percentageX / 100f));
    prevViewPercentageY = Math.max(0f, Math.min(1f, percentageY / 100f));
    if (windowManager == null || textView == null || layoutParams == null) return;
    fixViewPosition();
    try {
      if (textView.isAttachedToWindow()) windowManager.updateViewLayout(textView, layoutParams);
    } catch (Exception ignored) {
    }
  }

  public void setMaxLineNum(int maxLineNum) {
    this.maxLineNum = maxLineNum;
    if (textView == null || windowManager == null || layoutParams == null) return;
    if (!isSingleLine) textView.setMaxLines(maxLineNum);
    // 行数上限变了，能塞下的翻译行数也跟着变，必须重排一次文本
    textView.setText(buildDisplayText(currentLyric, currentExtendedLyrics));
    setLayoutParamsHeight();

    int maxY = maxHeight - layoutParams.height;
    int y = layoutParams.y;
    if (y < 0) y = 0;
    else if (y > maxY) y = maxY;
    if (layoutParams.y != y) layoutParams.y = y;

    safeUpdateViewLayout();
  }

  public void setWidth(int width) {
    if (textView == null || windowManager == null || layoutParams == null) return;
    widthPercentage = width / 100f;
    layoutParams.width = (int)(maxWidth * widthPercentage);
    textView.setWidth(layoutParams.width);

    int maxX = maxWidth - layoutParams.width;
    int x = layoutParams.x;
    if (x < 0) x = 0;
    else if (x > maxX) x = maxX;
    if (layoutParams.x != x) layoutParams.x = x;

    try {
      if (textView.isAttachedToWindow()) windowManager.updateViewLayout(textView, layoutParams);
    } catch (Exception ignored) {
    }
  }

  @Override
  public boolean onTouch(View v, MotionEvent event) {
    int maxX = maxWidth - layoutParams.width;
    int maxY = maxHeight - layoutParams.height;

    switch (event.getAction()){
      case MotionEvent.ACTION_DOWN:
        // 获取按下时的X，Y坐标
        lastX = event.getRawX();
        lastY = event.getRawY();

        preY = lastY;
        break;
      case MotionEvent.ACTION_MOVE:
        // 获取移动时的X，Y坐标
        nowX = event.getRawX();
        nowY = event.getRawY();
        if (preY == 0){
          preY = nowY;
        }
        // 计算XY坐标偏移量
        tranX = nowX - lastX;
        tranY = nowY - lastY;

        int x = layoutParams.x + (int)tranX;
        if (x < 0) x = 0;
        else if (x > maxX) x = maxX;
        int y = layoutParams.y + (int)tranY;
        if (y < 0) y = 0;
        else if (y > maxY) y = maxY;

        // 移动悬浮窗
        layoutParams.x = x;
        layoutParams.y = y;
        //更新悬浮窗位置
        safeUpdateViewLayout();
        //记录当前坐标作为下一次计算的上一次移动的位置坐标
        lastX = nowX;
        lastY = nowY;
        break;
      case MotionEvent.ACTION_UP:
        // float dy = nowY - preY;
        // Log.d("Lyric","dy: " + dy);
        // if (isVibrated){
        //   if (dy > 10){
        //     //down
        //     actions(AppHolder.actions[3]);
        //   }else if (dy<-10){
        //     //up
        //     actions(AppHolder.actions[4]);
        //   }else {
        //     //longClick
        //     actions(AppHolder.actions[2]);
        //   }
        //   isVibrated =false;
        // }
        //根据移动的位置来判断
        // dy = 0;
        tranY = 0;
        float percentageX = (float)layoutParams.x / (float) maxWidth * 100f;
        float percentageY = (float)layoutParams.y / (float) maxHeight * 100f;
        if (percentageX != prevViewPercentageX || percentageY != prevViewPercentageY) {
          prevViewPercentageX = percentageX / 100f;
          prevViewPercentageY = percentageY / 100f;
          sendPositionEvent(percentageX, percentageY);
        }
        break;
    }
    return true;
  }

  public void lockView() {
    isLock = true;
    if (windowManager == null || textView == null) return;
    layoutParams.flags = getLayoutParamsFlags();

    if (Build.VERSION.SDK_INT > Build.VERSION_CODES.R) {
      layoutParams.alpha = 0.8f;
    }
    textView.setBackgroundColor(Color.TRANSPARENT);
    safeUpdateViewLayout();
  }

  public void unlockView() {
    isLock = false;
    if (windowManager == null || textView == null) return;
    layoutParams.flags = getLayoutParamsFlags();

    if (Build.VERSION.SDK_INT > Build.VERSION_CODES.R) {
      layoutParams.alpha = 1.0f;
    }
    textView.setBackgroundResource(R.drawable.rounded_corner);
    safeUpdateViewLayout();
  }

  public void setColor(String unplayColor, String playedColor, String shadowColor) {
    this.unplayColor = unplayColor;
    this.playedColor = playedColor;
    this.shadowColor = shadowColor;
    if (textView == null) return;
    textView.setTextColor(parseColor(playedColor));
    textView.setPlayedPaintColor(parseColor(playedColor));
    textView.setUnplayedPaintColor(parseColor(unplayColor));
    textView.setShadowColor(parseColor(shadowColor));
    // 改颜色只需重绘，不需要重新布局窗口
  }

  public void setLyricTextPosition(String textX, String textY) {
    this.textX = textX;
    this.textY = textY;
    if (windowManager == null || textView == null) return;
    int textPositionX;
    int textPositionY;
    // Log.d("Lyric", "textX: " + textX + "  textY: " + textY);
    switch (textX) {
      case "CENTER":
        textPositionX = Gravity.CENTER_HORIZONTAL;
        break;
      case "RIGHT":
        textPositionX = Gravity.END;
        break;
      case "LEFT":
      default:
        textPositionX = Gravity.START;
        break;
    }
    switch (textY) {
      case "CENTER":
        textPositionY = Gravity.CENTER_VERTICAL;
        break;
      case "BOTTOM":
        textPositionY = Gravity.BOTTOM;
        break;
      case "TOP":
      default:
        textPositionY = Gravity.TOP;
        break;
    }
    textView.setGravity(textPositionX | textPositionY);
    safeUpdateViewLayout();
  }

  public void setAlpha(float alpha) {
    this.alpha = alpha;
    if (textView == null) return;
    textView.setAlpha(alpha);
  }

  public void setSingleLine(boolean isSingleLine) {
    this.isSingleLine = isSingleLine;
    if (textView == null || windowManager == null || layoutParams == null) return;
    safeRemoveView();
    try {
      createTextView();
      setLayoutParamsHeight();
      textView.setWidth(layoutParams.width);
      windowManager.addView(textView, layoutParams);
    } catch (Exception e) {
      // 悬浮窗权限被收回 / 窗口已销毁：保持原状态，别把异常抛回 JS 变成闪退
      Log.e("Lyric", "setSingleLine failed: " + e.getMessage());
      textView = null;
      return;
    }

    if (isLock) lockView();
    else unlockView();

    // 重建后把当前行（含翻译、逐字数据）补回去，否则切单行/多行会白屏到下一句
    setLyric(currentLyric, currentExtendedLyrics, currentWords);
  }

  public void setShowToggleAnima(boolean showToggleAnima) {
    isShowToggleAnima = showToggleAnima;
    if (textView == null) return;
    textView.setShowAnima(showToggleAnima);
  }

  public void setTextSize(float size) {
    this.textSize = size;
    if (windowManager == null || textView == null) return;
    textView.setTextSize(size);
    setLayoutParamsHeight();
    safeUpdateViewLayout();
  }

  /**
   * 安全移除桌面歌词视图。
   *
   * 直接 removeView 有两种必崩场景：
   * 1. 视图从未 attach（showDesktopLyric 尚未完成 addView，用户就点了关闭）；
   * 2. 视图已被系统移除（切到后台、悬浮窗权限被收回、或重复调用 hideDesktopLyric）。
   * 两种都会抛 IllegalArgumentException: View ... not attached to window manager，
   * 而且抛在 JS 调用的原生方法里，整条 React 消息队列会被打断，表现为「关歌词就闪退」。
   */
  private void safeRemoveView() {
    if (textView == null || windowManager == null) return;
    try {
      if (textView.isAttachedToWindow()) windowManager.removeView(textView);
    } catch (IllegalArgumentException e) {
      // 已经被移除或所属 window 已销毁，忽略即可
    }
  }

  /** 统一的窗口更新入口：视图已被系统摘除时 updateViewLayout 会抛 IllegalArgumentException，
   *  这里兜住，避免从方向传感器/触摸回调里把异常抛到主线程导致闪退。 */
  private void safeUpdateViewLayout() {
    if (windowManager == null || textView == null || layoutParams == null) return;
    try {
      if (textView.isAttachedToWindow()) windowManager.updateViewLayout(textView, layoutParams);
    } catch (Exception ignored) {
    }
  }

  public void destroyView() {
    if (textView == null || windowManager == null) return;
    safeRemoveView();
    textView = null;
    removeOrientationEvent();
  }

  public void destroy() {
    destroyView();
    windowManager = null;
    layoutParams = null;
  }
}
