import type { InlineRun } from "@/shared/content"

/** One stretch of a paragraph's text inside a single run: either a piece of a word or the whitespace between words. */
export interface Segment {
  /** Index of the run the text came from, so the renderer can wrap it in em / strong. */
  run: number
  kind: "word" | "space"
  text: string
  /** Words only: the word this piece belongs to. A word can span runs (`*muy*,` is one word of two pieces). */
  word?: number
}

export interface Tokens {
  /** The whole words, in reading order: what the timeline paces. */
  words: string[]
  /** Every stretch of text in order: concatenated they give back the paragraph exactly. */
  segments: Segment[]
}

/** Split runs into whole words and spaces. A word is never broken, not even by an em / strong boundary inside it. */
export function tokenizeRuns(runs: readonly InlineRun[]): Tokens {
  const words: string[] = []
  const segments: Segment[] = []
  let open = false
  runs.forEach((run, r) => {
    for (const match of run.text.matchAll(/\s+|\S+/g)) {
      const piece = match[0]
      if (/^\s/.test(piece)) {
        segments.push({ run: r, kind: "space", text: piece })
        open = false
        continue
      }
      if (!open) {
        words.push("")
        open = true
      }
      const word = words.length - 1
      words[word] += piece
      segments.push({ run: r, kind: "word", text: piece, word })
    }
  })
  return { words, segments }
}
