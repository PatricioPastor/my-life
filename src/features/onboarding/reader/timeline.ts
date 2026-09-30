import type { Block } from "@/shared/content"
import { tokenizeRuns } from "./words"

export interface TimingOptions {
  /** Words per minute for an average (five-letter) word. */
  wpm: number
  /** Extra beat after a comma, semicolon or colon. */
  clausePause: number
  /** Extra beat after a full stop, question mark, exclamation mark or ellipsis. */
  sentencePause: number
  /** The beat at the end of a paragraph, after its last word. */
  paragraphPause: number
}

/** About 220 wpm is 272 ms a word; the pauses are what make it read like a voice instead of a ticker. */
export const DEFAULT_TIMING: TimingOptions = { wpm: 220, clausePause: 120, sentencePause: 300, paragraphPause: 500 }

/** One block of the story on the reading timeline. Times are ms from the moment the block takes the focus. */
export interface ReadingEntry {
  blockIndex: number
  /** Paragraphs and quotes are read; subheadings and breaks are already painted. */
  readable: boolean
  /** When each word starts to paint. */
  wordStarts: number[]
  /** When the block is done (its last word plus the paragraph pause). Zero for a block that is not read. */
  endMs: number
}

export interface ReadingTimeline {
  entries: ReadingEntry[]
  /** Block indices of the readable entries, in order: paragraph N of the reader is `readables[N]`. */
  readables: number[]
}

const LETTERS = /[\p{L}\p{N}]/gu
// Closing quotes, brackets and the like sit after the punctuation that ends the word: look through them.
const CLOSERS = /[)\]}"'»”’›*_\s]+$/u

/** Longer words take longer to read: 1 at five letters, clamped so a one-letter word or a very long one stays sane. */
function lengthFactor(word: string): number {
  const letters = word.match(LETTERS)?.length ?? 0
  return Math.min(1.9, Math.max(0.7, 0.55 + 0.09 * letters))
}

function pauseAfter(word: string, t: TimingOptions): number {
  const tail = word.replace(CLOSERS, "")
  if (/(?:[.?!…]|\.\.\.)$/u.test(tail)) return t.sentencePause
  if (/[,;:]$/u.test(tail)) return t.clausePause
  return 0
}

/** When every word of every block starts to paint. Pure: the same blocks and options always give the same times. */
export function readingTimeline(blocks: readonly Block[], options: TimingOptions = DEFAULT_TIMING): ReadingTimeline {
  const base = 60000 / options.wpm
  const entries: ReadingEntry[] = []
  const readables: number[] = []
  blocks.forEach((block, blockIndex) => {
    if (block.type !== "paragraph" && block.type !== "quote") {
      entries.push({ blockIndex, readable: false, wordStarts: [], endMs: 0 })
      return
    }
    const { words } = tokenizeRuns(block.runs)
    const wordStarts: number[] = []
    let clock = 0
    words.forEach((word, i) => {
      wordStarts.push(clock)
      const last = i === words.length - 1
      clock += base * lengthFactor(word) + (last ? 0 : pauseAfter(word, options))
    })
    entries.push({ blockIndex, readable: words.length > 0, wordStarts, endMs: words.length > 0 ? clock + options.paragraphPause : 0 })
    if (words.length > 0) readables.push(blockIndex)
  })
  return { entries, readables }
}
