import { describe, expect, it } from "vitest"
import type { InlineRun } from "@/shared/content"
import { tokenizeRuns } from "./words"

const text = (t: string): InlineRun => ({ kind: "text", text: t })
const em = (t: string): InlineRun => ({ kind: "em", text: t })

describe("tokenizeRuns", () => {
  it("splits plain text into words and single spaces", () => {
    const { words, segments } = tokenizeRuns([text("Hola mundo.")])
    expect(words).toEqual(["Hola", "mundo."])
    expect(segments).toEqual([
      { run: 0, kind: "word", text: "Hola", word: 0 },
      { run: 0, kind: "space", text: " " },
      { run: 0, kind: "word", text: "mundo.", word: 1 },
    ])
  })

  it("keeps a word whole when a run boundary falls inside it", () => {
    const { words, segments } = tokenizeRuns([text("Es "), em("muy"), text(", claro")])
    expect(words).toEqual(["Es", "muy,", "claro"])
    const pieces = segments.filter((s) => s.kind === "word" && s.word === 1)
    expect(pieces.map((p) => [p.run, p.text])).toEqual([
      [1, "muy"],
      [2, ","],
    ])
  })

  it("keeps the spaces at the edges of a run", () => {
    const { segments } = tokenizeRuns([text("a "), em("b"), text(" c")])
    expect(segments.map((s) => s.text).join("")).toBe("a b c")
  })

  it("reproduces the source text exactly", () => {
    const runs = [text("¿Qué "), em("será"), text(", ñandú? "), { kind: "strong", text: "¡Sí!" } as InlineRun]
    expect(tokenizeRuns(runs).segments.map((s) => s.text).join("")).toBe("¿Qué será, ñandú? ¡Sí!")
  })

  it("returns nothing for no text", () => {
    expect(tokenizeRuns([])).toEqual({ words: [], segments: [] })
  })
})
