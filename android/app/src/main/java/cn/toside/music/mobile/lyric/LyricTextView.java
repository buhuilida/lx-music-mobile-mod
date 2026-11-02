package cn.toside.music.mobile.lyric;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.Log;
import android.view.Gravity;
import android.widget.TextView;

import java.util.ArrayList;

// https://github.com/Block-Network/StatusBarLyric/blob/main/app/src/main/java/statusbar/lyric/view/LyricTextView.kt
@SuppressLint("AppCompatCustomView")
public class LyricTextView extends TextView {
  private boolean isStop = true;
  private float textLength = 0F;
  private float viewWidth = 0F;
  private float viewHeight = 0F;
  private final float SPEED_LIMIT = 0.135F;
  private float speed;
  private float xx = 0F;
  private int gravityVertical = Gravity.TOP;
  private int gravityHorizontal = Gravity.CENTER;
  private float y = 0F;
  private String text = null;
  private final Paint mPaint;
  private final Paint playedPaint;
  private final Paint unplayedPaint;
  private final Runnable mStartScrollRunnable;
  private final Runnable invalidateRunnable;
  private final Runnable karaokeInvalidateRunnable;
  public static final int startScrollDelay = 1500;
  public static final int invalidateDelay = 10;
  public static final int karaokeInvalidateDelay = 33;

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
    if (words != null) postInvalidate();
  }

  public void setTextPaintSize(float size) {
    playedPaint.setTextSize(size);
    unplayedPaint.setTextSize(size);
  }

  /** 计算已演唱部分的像素宽度 */
  private float computePlayedWidth(String str, int nowMs) {
    if (words == null) return 0F;
    float width = 0F;
    for (long[] word : words) {
      int charStart = (int) word[0];
      int charEnd = (int) word[1];
      long startMs = word[2];
      long endMs = word[3];
      if (nowMs >= endMs) {
        width += mPaint.measureText(str, charStart, charEnd);
        continue;
      }
      if (nowMs > startMs && endMs > startMs) {
        float frac = (nowMs - startMs) / (float) (endMs - startMs);
        width += mPaint.measureText(str, charStart, charEnd) * frac;
      }
      break;
    }
    return width;
  }

  private void init() {
    xx = 0.0F;
    textLength = getTextLength();
    // viewWidth = (float) getWidth();
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
    if (mPaint != null) mPaint.setColor(color);
    postInvalidate();
  }

  @Override
  public void setShadowLayer(float radius, float dx, float dy, int shadowColor) {
    if (mPaint != null) mPaint.setShadowLayer(radius, dx, dy, shadowColor);
    playedPaint.setShadowLayer(radius, dx, dy, shadowColor);
    unplayedPaint.setShadowLayer(radius, dx, dy, shadowColor);
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
    y = getDrawY();
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

    y = getDrawY();
    // Log.d("Lyric", "gravityVertical: " + gravityVertical + " gravityHorizontal: " + gravityHorizontal);

    if (text == null) return;
    post(mStartScrollRunnable);
  }

  @Override
  protected void onDraw(Canvas canvas) {
    float mSpeed = speed;
    if (text != null) {
      float drawX = getDrawX();
      boolean karaoke = words != null && karaokeClock != null && text.length() > 0;
      if (karaoke) {
        // 逐字卡拉OK：先画未唱颜色，再裁剪叠加已唱颜色
        int now = karaokeClock.now();
        canvas.drawText(text, drawX, y, unplayedPaint);
        float playedWidth = computePlayedWidth(text, now);
        if (playedWidth > 0F) {
          canvas.save();
          canvas.clipRect(drawX, 0F, drawX + playedWidth, getHeight());
          canvas.drawText(text, drawX, y, playedPaint);
          canvas.restore();
        }
        if (karaokeClock.playing()) postDelayed(karaokeInvalidateRunnable, karaokeInvalidateDelay);
      } else {
        canvas.drawText(text, drawX, y, mPaint);
      }
      if (getText().length() >= 20) {
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
    return mPaint == null ? 0.0F : mPaint.measureText(text);
  }

  private float getDrawY() {
    Paint.FontMetrics fontMetrics = mPaint.getFontMetrics();
    float top = fontMetrics.top;
    float bottom = fontMetrics.bottom;
    float ascent = fontMetrics.ascent;
    // float descent = fontMetrics.descent;

    float y;

    // float y = Math.abs(mPaint.ascent() + mPaint.descent()) / 2;
    switch (gravityVertical) {
      case Gravity.CENTER_VERTICAL:
        y = viewHeight / 2F + (bottom - top) / 2 - bottom;
        break;
      case Gravity.BOTTOM:
        y = viewHeight - bottom;
        break;
      default:
        y = -ascent;
        break;
    }
    return y;
  }

  private float getDrawX() {
    float x;
    if (textLength < viewWidth) {
      switch (gravityHorizontal) {
        case Gravity.CENTER_HORIZONTAL:
          x = (viewWidth - textLength) / 2;
          break;
        case Gravity.END:
          x = viewWidth - textLength;
          break;
        default:
          x = 0;
          break;
      }
      isStop = true;
    } else {
      x = xx;
    }
    return x;
  }

  // public void setSpeed(float speed) {
  //  this.speed = speed;
  // }

}
