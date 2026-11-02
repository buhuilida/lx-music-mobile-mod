package cn.toside.music.mobile.lyric;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.Gravity;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * 桌面歌词文本视图（1.18.0）
 *
 * 在原「单行 + 卡拉OK」基础上支持多行：第一行是歌词本体（可逐字染色），
 * 之后的每一行是翻译 / 音译，使用更小的字号画在歌词正下方，
 * 与网易云等主流播放器的桌面歌词观感一致。
 *
 * 注意：TextView 自带的 Layout 不支持这种混排，所以绘制全部由 onDraw 接管。
 */
@SuppressLint("AppCompatCustomView")
public class LyricTextView extends TextView {
  /** 翻译行相对主歌词的字号比例 */
  private static final float TRANSLATION_SCALE = 0.64F;
  private static final float SPEED_LIMIT = 0.135F;
  public static final int startScrollDelay = 1500;
  public static final int invalidateDelay = 10;
  public static final int karaokeInvalidateDelay = 33;

  private boolean isStop = true;
  private float textLength = 0F;
  private float viewWidth = 0F;
  private float viewHeight = 0F;
  private float speed;
  private float xx = 0F;
  private int gravityVertical = Gravity.TOP;
  private int gravityHorizontal = Gravity.CENTER;
  private String text = null;

  private final Paint mPaint;
  private final Paint playedPaint;
  private final Paint unplayedPaint;
  private final Paint translationPaint;

  private final Runnable mStartScrollRunnable;
  private final Runnable invalidateRunnable;
  private final Runnable karaokeInvalidateRunnable;

  /** 逐字卡拉OK：words 每项 {charStart, charEnd, startMs, endMs} */
  private ArrayList<long[]> words = null;
  private KaraokeClock karaokeClock = null;

  public interface KaraokeClock {
    int now();
    boolean playing();
  }

  public LyricTextView(Context context) {
    super(context);
    mStartScrollRunnable = LyricTextView.this::startScroll;
    invalidateRunnable = LyricTextView.this::invalidate;
    karaokeInvalidateRunnable = LyricTextView.this::invalidate;
    mPaint = getPaint();
    playedPaint = new Paint(mPaint);
    unplayedPaint = new Paint(mPaint);
    translationPaint = new Paint(mPaint);
    translationPaint.setTextSize(mPaint.getTextSize() * TRANSLATION_SCALE);
    speed = SPEED_LIMIT * getTextSize();
  }

  public void setKaraokeClock(KaraokeClock clock) {
    this.karaokeClock = clock;
    postInvalidate();
  }

  public void setKaraokeWords(ArrayList<long[]> newWords) {
    this.words = (newWords == null || newWords.isEmpty()) ? null : newWords;
    postInvalidate();
  }

  public void setPlayedPaintColor(int color) {
    playedPaint.setColor(color);
    if (words != null) postInvalidate();
  }

  public void setUnplayedPaintColor(int color) {
    unplayedPaint.setColor(color);
    translationPaint.setColor(color);
    translationPaint.setAlpha(200);
    if (words != null) postInvalidate();
  }

  public void setTextPaintSize(float size) {
    playedPaint.setTextSize(size);
    unplayedPaint.setTextSize(size);
    translationPaint.setTextSize(size * TRANSLATION_SCALE);
  }

  private static String mainLineOf(String text) {
    if (text == null) return "";
    int index = text.indexOf('\n');
    return index < 0 ? text : text.substring(0, index);
  }

  /** 计算已演唱部分的像素宽度 */
  private float computePlayedWidth(String mainLine, int nowMs) {
    if (words == null) return 0F;
    float width = 0F;
    for (long[] word : words) {
      int charStart = (int) word[0];
      int charEnd = (int) word[1];
      if (charStart >= mainLine.length()) break;
      if (charEnd > mainLine.length()) charEnd = mainLine.length();
      long startMs = word[2];
      long endMs = word[3];
      if (nowMs >= endMs) {
        width += mPaint.measureText(mainLine, charStart, charEnd);
        continue;
      }
      if (nowMs > startMs && endMs > startMs) {
        float frac = (nowMs - startMs) / (float) (endMs - startMs);
        width += mPaint.measureText(mainLine, charStart, charEnd) * frac;
      }
      break;
    }
    return width;
  }

  private void init() {
    xx = 0.0F;
    textLength = getTextLength();
  }

  @Override
  protected void onDetachedFromWindow() {
    removeCallbacks(mStartScrollRunnable);
    super.onDetachedFromWindow();
  }

  @Override
  protected void onTextChanged(CharSequence text, int start, int lengthBefore, int lengthAfter) {
    super.onTextChanged(text, start, lengthBefore, lengthAfter);
    stopScroll();
    this.text = text.toString();
    init();
    postInvalidate();
    postDelayed(mStartScrollRunnable, startScrollDelay);
  }

  @Override
  public void setTextColor(int color) {
    if (mPaint != null) {
      mPaint.setColor(color);
      translationPaint.setColor(color);
      translationPaint.setAlpha(200);
    }
    postInvalidate();
  }

  @Override
  public void setShadowLayer(float radius, float dx, float dy, int shadowColor) {
    if (mPaint != null) mPaint.setShadowLayer(radius, dx, dy, shadowColor);
    playedPaint.setShadowLayer(radius, dx, dy, shadowColor);
    unplayedPaint.setShadowLayer(radius, dx, dy, shadowColor);
    translationPaint.setShadowLayer(radius, dx, dy, shadowColor);
    post(mStartScrollRunnable);
  }

  @Override
  public void setTextSize(float size) {
    super.setTextSize(size);
    speed = SPEED_LIMIT * size;
    setTextPaintSize(getTextSize());
    if (text == null) return;
    post(mStartScrollRunnable);
  }

  @Override
  public void setWidth(int pixels) {
    super.setWidth(pixels);
    viewWidth = pixels;
    if (text == null) return;
    post(mStartScrollRunnable);
  }

  @Override
  public void setHeight(int pixels) {
    super.setHeight(pixels);
    viewHeight = pixels;
    if (text == null) return;
    post(mStartScrollRunnable);
  }

  @Override
  public void setGravity(int gravity) {
    if ((gravity & Gravity.RELATIVE_HORIZONTAL_GRAVITY_MASK) == 0) {
      gravity |= Gravity.START;
    }
    if ((gravity & Gravity.VERTICAL_GRAVITY_MASK) == 0) {
      gravity |= Gravity.TOP;
    }

    gravityVertical = gravity & Gravity.VERTICAL_GRAVITY_MASK;
    gravityHorizontal = gravity & Gravity.RELATIVE_HORIZONTAL_GRAVITY_MASK;

    if (text == null) return;
    post(mStartScrollRunnable);
  }

  private static float lineHeight(Paint paint) {
    Paint.FontMetrics metrics = paint.getFontMetrics();
    return metrics.bottom - metrics.top;
  }

  /** 单行水平位置：放得下就按对齐方式，放不下就从左侧开始（跟随滚动） */
  private float getLineX(String line, Paint paint) {
    float width = paint.measureText(line);
    if (width < viewWidth) {
      switch (gravityHorizontal) {
        case Gravity.CENTER_HORIZONTAL:
          return (viewWidth - width) / 2;
        case Gravity.END:
          return viewWidth - width;
        default:
          return 0;
      }
    }
    return xx;
  }

  @Override
  protected void onDraw(Canvas canvas) {
    float mSpeed = speed;
    if (text != null) {
      String[] lines = text.split("\n", -1);
      String mainLine = lines.length > 0 ? lines[0] : "";
      int extraCount = lines.length - 1;

      float mainHeight = lineHeight(mPaint);
      float transHeight = lineHeight(translationPaint);
      float totalHeight = mainHeight + extraCount * transHeight;

      float startY;
      switch (gravityVertical) {
        case Gravity.CENTER_VERTICAL:
          startY = (viewHeight - totalHeight) / 2F - mPaint.getFontMetrics().top;
          break;
        case Gravity.BOTTOM:
          startY = viewHeight - totalHeight - mPaint.getFontMetrics().top;
          break;
        default:
          startY = -mPaint.getFontMetrics().ascent;
          break;
      }

      float drawX = getLineX(mainLine, mPaint);
      boolean karaoke = words != null && karaokeClock != null && mainLine.length() > 0;
      if (karaoke) {
        // 逐字卡拉OK：先画未唱颜色，再裁剪叠加已唱颜色
        int now = karaokeClock.now();
        canvas.drawText(mainLine, drawX, startY, unplayedPaint);
        float playedWidth = computePlayedWidth(mainLine, now);
        if (playedWidth > 0F) {
          canvas.save();
          canvas.clipRect(drawX, 0F, drawX + playedWidth, getHeight());
          canvas.drawText(mainLine, drawX, startY, playedPaint);
          canvas.restore();
        }
        if (karaokeClock.playing()) postDelayed(karaokeInvalidateRunnable, karaokeInvalidateDelay);
      } else {
        canvas.drawText(mainLine, drawX, startY, mPaint);
      }

      // 翻译 / 音译行：小字号、略淡，居中画在歌词下方
      float lineY = startY;
      for (int i = 1; i < lines.length; i++) {
        lineY += transHeight;
        String line = lines[i];
        if (line.isEmpty()) continue;
        canvas.drawText(line, getLineX(line, translationPaint), lineY, translationPaint);
      }

      if (mainLine.length() >= 20) {
        mSpeed += mSpeed;
      }
    }

    if (!isStop) {
      if (viewWidth - xx + mSpeed >= textLength) {
        xx = viewWidth - textLength - 2;
        stopScroll();
      } else {
        xx -= mSpeed;
      }

      invalidateAfter();
    }
  }

  private void invalidateAfter() {
    removeCallbacks(invalidateRunnable);
    postDelayed(invalidateRunnable, invalidateDelay);
  }

  private void startScroll() {
    init();
    isStop = false;
    postInvalidate();
  }

  private void stopScroll() {
    isStop = true;
    removeCallbacks(mStartScrollRunnable);
    postInvalidate();
  }

  private float getTextLength() {
    if (mPaint == null) return 0F;
    return mPaint.measureText(mainLineOf(text));
  }

  // public void setSpeed(float speed) {
  //  this.speed = speed;
  // }

}
