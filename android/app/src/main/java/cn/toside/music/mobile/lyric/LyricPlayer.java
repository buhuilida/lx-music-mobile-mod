package cn.toside.music.mobile.lyric;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LyricPlayer {
  final String timeFieldExp = "^(?:\\[[\\d:.]+])+";
  final String timeExp = "\\d{1,3}(:\\d{1,3}){0,2}(?:\\.\\d{1,3})";
  final String msTimeRxp = "\\[\\d{1,3}(:\\d{1,3}){0,2}\\.\\d{3}]";
//  HashMap tagRegMap;
  Pattern timeFieldPattern;
  Pattern timePattern;
  Pattern msTimePattern;

  String lyric = "";
  String wordLyric = "";
  ArrayList<String> extendedLyrics = new ArrayList<>();
  // 逐字标签：<开始毫秒,持续毫秒>（洛雪，时间相对行首）与 <mm:ss.xx[,dur]>（A2，绝对时间）
  final java.util.regex.Pattern lxWordPattern = Pattern.compile("<(\\d{1,7}),(\\d+(?:\\.\\d+)?)>");
  final java.util.regex.Pattern a2WordPattern = Pattern.compile("<(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?(?:,(\\d+(?:\\.\\d+)?))?>");
  List<HashMap> lines = new ArrayList<>();
  HashMap tags = new HashMap();
  boolean isPlay = false;
  float playbackRate = 1;
  int curLineNum = 0;
  int maxLine = 0;
  int offset = 150;
  int performanceTime = 0;
  int startPlayTime = 0;
  // int delay = 0;
  Object tid = null;
  boolean tempPause = false;
  boolean tempPaused = false;

  LyricPlayer() {
//    tagRegMap = new HashMap<String, String>();
//    tagRegMap.put("title", "ti");
//    tagRegMap.put("artist", "ar");
//    tagRegMap.put("album", "al");
//    tagRegMap.put("offset", "offset");
//    tagRegMap.put("by", "by");
//    tags = new HashMap();

    timeFieldPattern = Pattern.compile(timeFieldExp);
    timePattern = Pattern.compile(timeExp);
    msTimePattern = Pattern.compile(msTimeRxp);
  }

  public void setTempPause(boolean isPaused) {
    if (isPaused) {
      tempPause = true;
    } else {
      tempPause = false;
      if (tempPaused) {
        tempPaused = false;
        if (isPlay) refresh();
      }
    }
  }

//  @RequiresApi(api = Build.VERSION_CODES.N)
//  private void initTag() {
//    tagRegMap.forEach((tag, value) -> {
//      Pattern pattern = Pattern.compile("\\[" + value + ":([^\\]]*)]", Pattern.CASE_INSENSITIVE);
//      Matcher matcher = pattern.matcher(lyric);
//
//      tags.put(tag, matcher.group(1));
//    });
//  }

  private void startTimeout(Runnable runnable, long delay) {
    if (tid != null) Utils.clearTimeout(tid);
    tid = Utils.setTimeout(runnable, delay);
  }

  private void stopTimeout() {
    if (tid == null) return;
    Utils.clearTimeout(tid);
    tid = null;
  }

  private int getNow() {
    return (int)(System.nanoTime() / 1000000);
  }

  public int getCurrentTime() {
    return (int)((getNow() - this.performanceTime) * this.playbackRate) + startPlayTime;
  }

  private void initTag() {
    tags = new HashMap();
    Matcher matcher = Pattern.compile("\\[(ti|ar|al|offset|by):\\s*(\\S+(?:\\s+\\S+)*)\\s*]").matcher(this.lyric);
    while (matcher.find()) {
      String key = matcher.group(1);
      if (key == null) continue;
      String val = matcher.group(2);
      if (val == null) val = "";
      tags.put(key, val);
    }

    String offsetStr = (String) tags.get("offset");
    if (offsetStr == null || offsetStr.equals("")) {
      tags.put("offset", 0);
    } else {
      int offset;
      try {
        offset = Integer.parseInt(offsetStr);
      } catch (Exception err) {
        offset = 0;
      }
      tags.put("offset", offset);
    }
  }


  final String t_rxp_1 = "^0+(\\d+)";
  final String t_rxp_2 = ":0+(\\d+)";
  final String t_rxp_3 = "\\.0+(\\d+)";
  private String formatTimeLabel(String label) {
    return label.replaceAll(t_rxp_1, "$1")
      .replaceAll(t_rxp_2, ":$1")
      .replaceAll(t_rxp_3, ".$1");
  }

  /**
   * 归一化时间键（1.18.0）
   *
   * LRC 的毫秒位可能是 2 位（[00:05.50]）或 3 位（[00:05.500]），
   * 逐字歌词与翻译行如果精度不同就会匹配不上，这里统一补成 3 位。
   */
  private String normalizeTimeKey(String label) {
    int dot = label.lastIndexOf('.');
    if (dot < 0) return label + ".000";
    String frac = label.substring(dot + 1);
    if (frac.length() > 3) frac = frac.substring(0, 3);
    while (frac.length() < 3) frac += "0";
    return label.substring(0, dot + 1) + frac;
  }

  private void parseExtendedLyric(HashMap linesMap, String extendedLyric) {
    String[] extendedLyricLines = extendedLyric.split("\r\n|\n|\r");
    for (String translationLine : extendedLyricLines) {
      String line = translationLine.trim();
      Matcher timeFieldResult = timeFieldPattern.matcher(line);
      if (timeFieldResult.find()) {
        String timeField = timeFieldResult.group();
        String text = line.replaceAll(timeFieldExp, "").trim();
        if (text.length() > 0) {
          Matcher timeMatchResult = timePattern.matcher(timeField);
          while (timeMatchResult.find()) {
            String timeStr = timeMatchResult.group();
            timeStr = normalizeTimeKey(formatTimeLabel(timeStr));
            HashMap targetLine = (HashMap) linesMap.get(timeStr);
            if (targetLine != null) ((ArrayList<String>) targetLine.get("extendedLyrics")).add(text);
          }
        }
      }
    }
  }

  public static String padEnd(String str, int length, char padChar) {
    if (str.length() >= length) {
      return str;
    }
    return str + String.valueOf(padChar).repeat(length - str.length());
  }

  private void initLines() {
    boolean isMsTime = msTimePattern.matcher(this.lyric).find();
    String[] linesStr = lyric.split("\r\n|\n|\r");
    lines = new ArrayList<>();

    HashMap linesMap = new HashMap<String, HashMap>();
    HashMap timeMap = new HashMap<String, Integer>();

    for (String lineStr : linesStr) {
      String line = lineStr.trim();
      Matcher timeFieldResult = timeFieldPattern.matcher(line);
      if (timeFieldResult.find()) {
        String timeField = timeFieldResult.group();
        String text = line.replaceAll(timeFieldExp, "").trim();
        if (text.length() > 0) {
          Matcher timeMatchResult = timePattern.matcher(timeField);
          while (timeMatchResult.find()) {
            String timeStr = normalizeTimeKey(formatTimeLabel(timeMatchResult.group()));
            if (linesMap.containsKey(timeStr)) {
              ((ArrayList<String>) ((HashMap) linesMap.get(timeStr)).get("extendedLyrics")).add(text);
              continue;
            }
            String[] timeArr = timeStr.split(":");
            String hours;
            String minutes;
            String seconds;
            String milliseconds = "0";
            switch (timeArr.length) {
              case 3:
                hours = timeArr[0];
                minutes = timeArr[1];
                seconds = timeArr[2];
                break;
              case 2:
                hours = "0";
                minutes = timeArr[0];
                seconds = timeArr[1];
                break;
              case 1:
                hours = "0";
                minutes = "0";
                seconds = timeArr[0];
                break;
              default:
                continue;
            }
            if (seconds.contains(".")) {
              timeArr = seconds.split("\\.");
              seconds = timeArr[0];
              if (timeArr.length > 1) {
                String msStr = timeArr[1];
                if (!isMsTime) msStr = padEnd(msStr, 3, '0');
                milliseconds = msStr;
              }
            }
            HashMap<String, Object> lineInfo = new HashMap<>();
            int time = Integer.parseInt(hours) * 60 * 60 * 1000
              + Integer.parseInt(minutes) * 60 * 1000
              + Integer.parseInt(seconds) * 1000
              + Integer.parseInt(milliseconds);
            lineInfo.put("time", time);
            lineInfo.put("text", text);
            lineInfo.put("extendedLyrics", new ArrayList<String>(extendedLyrics.size()));
            timeMap.put(timeStr, time);
            linesMap.put(timeStr, lineInfo);
          }
        }
      }
    }

    for (String extendedLyric : extendedLyrics) {
      parseExtendedLyric(linesMap, extendedLyric);
    }

    Set<Entry<String, Integer>> set = timeMap.entrySet();
    List<Entry<String, Integer>> list = new ArrayList<Entry<String, Integer>>(set);
    Collections.sort(list, new Comparator<Entry<String, Integer>>() {
      public int compare(Map.Entry<String, Integer> o1,
                         Map.Entry<String, Integer> o2) {
        return o1.getValue().compareTo(o2.getValue());
      }
    });

    // lines = new ArrayList<HashMap>(list.size());
    for (Entry<String, Integer> entry : list) {
      lines.add((HashMap) linesMap.get(entry.getKey()));
    }

    if (wordLyric != null && wordLyric.length() > 0) parseWordLyric(linesMap, timeMap);

    this.maxLine = lines.size() - 1;
  }

  /**
   * 解析逐字歌词并按行时间匹配挂到 lines 上（word: charStart, charEnd, startMs, endMs）
   */
  @SuppressWarnings("unchecked")
  private void parseWordLyric(HashMap<String, HashMap> linesMap, HashMap<String, Integer> timeMap) {
    if (wordLyric == null || wordLyric.length() == 0) return;
    String[] wordLines = wordLyric.split("\r\n|\n|\r");
    for (String lineStr : wordLines) {
      String line = lineStr.trim();
      Matcher timeFieldResult = timeFieldPattern.matcher(line);
      if (!timeFieldResult.find()) continue;
      String timeField = timeFieldResult.group();
      String content = line.replaceAll(timeFieldExp, "").trim();
      if (content.length() == 0) continue;

      Matcher timeMatchResult = timePattern.matcher(timeField);
      while (timeMatchResult.find()) {
        String timeStr = normalizeTimeKey(formatTimeLabel(timeMatchResult.group()));
        HashMap targetLine = linesMap.get(timeStr);
        if (targetLine == null) continue;

        // 逐 token 切分：[isTag, text, startMs, durMs]
        ArrayList<Object[]> tokens = new ArrayList<>();
        String rest = content;
        StringBuilder pending = new StringBuilder();
        while (rest.length() > 0) {
          java.util.regex.Matcher lx = lxWordPattern.matcher(rest);
          java.util.regex.Matcher a2 = a2WordPattern.matcher(rest);
          boolean lxHit = lx.lookingAt();
          boolean a2Hit = !lxHit && a2.lookingAt();
          if (lxHit) {
            if (pending.length() > 0) { tokens.add(new Object[]{false, pending.toString(), 0, 0}); pending.setLength(0); }
            tokens.add(new Object[]{true, "", Integer.parseInt(lx.group(1)), Math.round(Float.parseFloat(lx.group(2)))});
            rest = rest.substring(lx.end());
          } else if (a2Hit) {
            if (pending.length() > 0) { tokens.add(new Object[]{false, pending.toString(), 0, 0}); pending.setLength(0); }
            int min = Integer.parseInt(a2.group(1));
            int sec = Integer.parseInt(a2.group(2));
            int frac = 0;
            if (a2.group(3) != null) {
              String msStr = a2.group(3);
              if (msStr.length() < 3) msStr = padEnd(msStr, 3, '0');
              frac = Integer.parseInt(msStr);
            }
            long start = min * 60000L + sec * 1000L + frac;
            long dur = a2.group(4) == null ? 0 : Math.round(Float.parseFloat(a2.group(4)) * 1000);
            tokens.add(new Object[]{true, "", (int) start, (int) dur});
            rest = rest.substring(a2.end());
          } else {
            pending.append(rest.charAt(0));
            rest = rest.substring(1);
          }
        }
        if (pending.length() > 0) tokens.add(new Object[]{false, pending.toString(), 0, 0});
        if (tokens.isEmpty()) continue;

        int lineTime = (int) targetLine.get("time");
        StringBuilder cleanText = new StringBuilder();
        ArrayList<long[]> words = new ArrayList<>();
        Integer pendingStart = null, pendingDur = null;
        long[] lastWord = null;
        for (int i = 0; i < tokens.size(); i++) {
          Object[] tk = tokens.get(i);
          boolean isTag = (Boolean) tk[0];
          if (isTag) {
            pendingStart = (Integer) tk[2];
            pendingDur = (Integer) tk[3];
            continue;
          }
          String wordText = (String) tk[1];
          Integer start = pendingStart;
          Integer dur = pendingDur;
          pendingStart = null;
          pendingDur = null;
          if (start == null) {
            // 文本在标签之前（A2）：向后找最近的标签
            for (int j = i + 1; j < tokens.size(); j++) {
              Object[] nt = tokens.get(j);
              if (!(Boolean) nt[0]) continue;
              start = (Integer) nt[2];
              if (dur == null || dur == 0) dur = (Integer) nt[3];
              break;
            }
          }
          if (start == null) {
            // 尾部无标签文本并入最后一个字，避免丢字
            if (lastWord != null) lastWord[1] += wordText.length();
            continue;
          }
          // 洛雪格式开始时间相对行首：明显小于行时间时按相对处理
          if (start < lineTime) start += lineTime;
          long[] word = { cleanText.length(), cleanText.length() + wordText.length(), start, start + dur };
          cleanText.append(wordText);
          words.add(word);
          lastWord = word;
        }
        if (words.isEmpty()) continue;
        String lineText = (String) targetLine.get("text");
        // 逐字文本必须与行文本完全一致才启用卡拉OK（避免错位高亮）
        if (!cleanText.toString().equals(lineText)) continue;
        for (int i = 0; i < words.size(); i++) {
          long[] w = words.get(i);
          if (w[3] <= w[2]) {
            long nextStart = i + 1 < words.size() ? words.get(i + 1)[2] : lineTime + (w[1] - w[0]) * 200L;
            w[3] = Math.max(w[2] + 60, nextStart);
          }
        }
        targetLine.put("words", words);
      }
    }
  }

  private void  init() {
    if (lyric == null) lyric = "";
    if (extendedLyrics == null) extendedLyrics = new ArrayList<>();
    initTag();
    initLines();
    onSetLyric(lines);
  }

  public void pause() {
    if (!isPlay) return;
    isPlay = false;
    tempPaused = false;
    stopTimeout();
    if (curLineNum == maxLine) return;
    int curLineNum = this.findCurLineNum(getCurrentTime());
    if (this.curLineNum != curLineNum) {
      this.curLineNum = curLineNum;
      this.onPlay(curLineNum);
    }
  }

  public void play(int curTime) {
    if (this.lines.size() == 0) return;
    pause();
    isPlay = true;

    Object tagOffset = tags.get("offset");
    if (tagOffset == null) tagOffset = 0;
    performanceTime = getNow() - (int) tagOffset - offset;
    startPlayTime = curTime;

    curLineNum = findCurLineNum(getCurrentTime()) - 1;

    refresh();
  }

  private int findCurLineNum(int curTime, int startIndex) {
    // Log.d("Lyric", "findCurLineNum: " + startIndex);
    if (curTime <= 0) return 0;
    int length = lines.size();
    for (int index = startIndex; index < length; index++) {
      if (curTime < (int) ((HashMap)lines.get(index)).get("time")) return index == 0 ? 0 : index - 1;
    }
    return length - 1;
  }

  private int findCurLineNum(int curTime) {
    return findCurLineNum(curTime, 0);
  }

  private void handleMaxLine() {
    this.onPlay(this.curLineNum);
    this.pause();
  }

  private void refresh() {
    if (tempPaused) tempPaused = false;

    curLineNum++;
    // Log.d("Lyric", "refresh: " + curLineNum);

    if (curLineNum >= maxLine) {
      handleMaxLine();
      return;
    }
    HashMap curLine = lines.get(curLineNum);

    int currentTime = getCurrentTime();
    int driftTime = currentTime - (int)curLine.get("time");
    // Log.d("Lyric", "driftTime: " + driftTime + "  time: " + curLine.get("time") + "  currentTime: " + currentTime);

    if (driftTime >= 0 || curLineNum == 0) {
      HashMap nextLine = lines.get(curLineNum + 1);
      int delay = (int)(((int)nextLine.get("time") - (int)curLine.get("time") - driftTime) / this.playbackRate);
      // Log.d("Lyric", "delay: " + delay + "  driftTime: " + driftTime);
      if (delay > 0) {
        if (isPlay) {
          startTimeout(() -> {
            if (tempPause) {
              tempPaused = true;
              return;
            }
            if (!isPlay) return;
            refresh();
          }, delay);
        }
        onPlay(curLineNum);
      } else {
        int newCurLineNum = this.findCurLineNum(currentTime, curLineNum + 1);
        if (newCurLineNum > curLineNum) curLineNum = newCurLineNum - 1;
        // Log.d("Lyric", "refresh--: " + curLineNum + "  newCurLineNum: " + newCurLineNum);
        refresh();
      }
      return;
    }

    curLineNum = this.findCurLineNum(currentTime, curLineNum) - 1;
    refresh();
  }

  public void setLyric(String lyric, ArrayList<String> extendedLyrics) {
    setLyric(lyric, extendedLyrics, null);
  }

  public void setLyric(String lyric, ArrayList<String> extendedLyrics, String wordLyric) {
    if (isPlay) pause();
    this.lyric = lyric;
    this.extendedLyrics = extendedLyrics;
    this.wordLyric = wordLyric == null ? "" : wordLyric;
    init();
  }

  public boolean isPlaying() {
    return isPlay;
  }

  public void setPlaybackRate(float playbackRate) {
    this.playbackRate = playbackRate;
    if (this.lines.size() == 0) return;
    if (!this.isPlay) return;
    this.play(this.getCurrentTime());
  }

  public void onPlay(int lineNum) {}

  public void onSetLyric(List lines) {}

}
