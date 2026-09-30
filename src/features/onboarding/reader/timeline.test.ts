import { describe, expect, it } from "vitest"
import type { Block } from "@/shared/content"
import { DEFAULT_TIMING, readingTimeline, type TimingOptions } from "./timeline"

const para = (text: string): Block => ({ type: "paragraph", runs: [{ kind: "text", text }] })

// 240 wpm is 250 ms per word, and a five-letter word has a length factor of exactly 1.
const T: TimingOptions = { ...DEFAULT_TIMING, wpm: 240 }

describe("readingTimeline", () => {
  it("starts each word after the previous one, at reading pace", () => {
    const [e] = readingTimeline([para("abcde abcde abcde")], T).entries
    expect(e!.wordStarts).toEqual([0, 250, 500])
  })

  it("ends a paragraph after its last word plus the paragraph pause", () => {
    const [e] = readingTimeline([para("abcde abcde abcde")], T).entries
    expect(e!.endMs).toBe(500 + 250 + T.paragraphPause)
  })

  it("adds the small pause after comma, semicolon and colon", () => {
    const [e] = readingTimeline([para("abcde, abcde; abcde: abcde")], T).entries
    expect(e!.wordStarts).toEqual([0, 250 + T.clausePause, 500 + 2 * T.clausePause, 750 + 3 * T.clausePause])
  })

  it("adds the long pause after a full stop, question or exclamation mark", () => {
    const [e] = readingTimeline([para("abcde. abcde? abcde! abcde…")], T).entries
    expect(e!.wordStarts.slice(1)).toEqual([250 + T.sentencePause, 500 + 2 * T.sentencePause, 750 + 3 * T.sentencePause])
  })

  it("looks through closing quotes and brackets to the punctuation before them", () => {
    const [e] = readingTimeline([para("abcde.» abcde”, abcde")], T).entries
    expect(e!.wordStarts).toEqual([0, 250 + T.sentencePause, 500 + T.sentencePause + T.clausePause])
  })

  it("takes longer on long words and less on short ones", () => {
    const [short] = readingTimeline([para("ab ab")], T).entries
    const [mid] = readingTimeline([para("abcde abcde")], T).entries
    const [long] = readingTimeline([para("abcdefghijkl abcde")], T).entries
    expect(short!.wordStarts[1]).toBeLessThan(mid!.wordStarts[1]!)
    expect(long!.wordStarts[1]).toBeGreaterThan(mid!.wordStarts[1]!)
  })

  it("never lets a very short or very long word collapse or balloon", () => {
    const [a] = readingTimeline([para("a a")], T).entries
    const [b] = readingTimeline([para(`${"x".repeat(60)} a`)], T).entries
    expect(a!.wordStarts[1]).toBeGreaterThan(150)
    expect(b!.wordStarts[1]).toBeLessThan(250 * 2)
  })

  it("reads at about 300 words per minute by default: 200 ms for an average word", () => {
    const words = Array.from({ length: 300 }, () => "abcde").join(" ")
    const [e] = readingTimeline([para(words)]).entries
    const lastStart = e!.wordStarts[299]!
    expect(lastStart).toBeGreaterThan(299 * 200 * 0.99)
    expect(lastStart).toBeLessThan(299 * 200 * 1.01)
  })

  it("keeps its pauses proportionally short by default: comma 90, full stop 220, paragraph end 300", () => {
    expect(DEFAULT_TIMING).toEqual({ wpm: 300, clausePause: 90, sentencePause: 220, paragraphPause: 300 })
    const [e] = readingTimeline([para("abcde, abcde. abcde")]).entries
    expect(e!.wordStarts).toEqual([0, 200 + 90, 400 + 90 + 220])
    expect(e!.endMs).toBe(400 + 90 + 220 + 200 + 300)
  })

  it("reads a quote like a paragraph", () => {
    const quote: Block = { type: "quote", runs: [{ kind: "text", text: "abcde abcde" }] }
    const [q] = readingTimeline([quote], T).entries
    const [p] = readingTimeline([para("abcde abcde")], T).entries
    expect(q).toEqual({ ...p, blockIndex: 0 })
    expect(q!.readable).toBe(true)
  })

  it("counts a word split across runs once", () => {
    const b: Block = { type: "paragraph", runs: [{ kind: "text", text: "Es " }, { kind: "em", text: "muy" }, { kind: "text", text: ", claro" }] }
    expect(readingTimeline([b], T).entries[0]!.wordStarts).toHaveLength(3)
  })

  it("paints subheadings and breaks instantly, and does not make them readable", () => {
    const { entries, readables } = readingTimeline(
      [{ type: "subheading", text: "un apartado" }, { type: "break" }, para("abcde abcde")],
      T,
    )
    expect(entries.map((e) => [e.readable, e.wordStarts.length, e.endMs])).toEqual([
      [false, 0, 0],
      [false, 0, 0],
      [true, 2, 250 + 250 + T.paragraphPause],
    ])
    expect(readables).toEqual([2])
  })

  it("indexes entries by block", () => {
    const { entries } = readingTimeline([para("a"), { type: "break" }, para("b")], T)
    expect(entries.map((e) => e.blockIndex)).toEqual([0, 1, 2])
  })
})
