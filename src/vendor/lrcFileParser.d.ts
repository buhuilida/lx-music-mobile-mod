/**
 * 内置 lrc-file-parser 的类型声明。
 *
 * 实现见同目录 lrcFileParser.js（对 timeoutTools 的定时器野链做了修复），
 * 类型直接复用上游包，避免两边签名漂移。
 */
import Lyric from 'lrc-file-parser'

export type { Line, Lines, Options } from 'lrc-file-parser'
export default Lyric
