import { describe, expect, it } from "vitest"
import { loadStory } from "./load-story"

describe("loadStory", () => {
  it("parses the shipped intro story", () => {
    const { meta, blocks } = loadStory("content/intro/por-que-cree-esto.md")
    expect(meta).toEqual({ title: "¿por qué creé esto?", updated: "2026-09-30" })
    const types = new Set(blocks.map((b) => b.type))
    expect(types).toEqual(new Set(["paragraph", "quote", "break"]))
    const kinds = new Set(blocks.flatMap((b) => ("runs" in b ? b.runs.map((r) => r.kind) : [])))
    expect(kinds).toEqual(new Set(["text", "em", "strong"]))
    expect(blocks.filter((b) => b.type === "paragraph").length).toBeGreaterThanOrEqual(5)
  })

  it("prefixes a failure with the file it came from", () => {
    expect(() => loadStory("content/intro/missing.md")).toThrow(/content\/intro\/missing\.md/)
  })
})
