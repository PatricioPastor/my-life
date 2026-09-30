import { describe, expect, it } from "vitest"
import { loadStory } from "./load-story"

// The story file is the author's to rewrite: this checks the pipeline, never the text. Parser behaviour lives in parse-story.test.ts.
describe("loadStory", () => {
  it("loads the shipped intro story into a valid Story", () => {
    const { meta, blocks } = loadStory("content/intro/por-que-cree-esto.md")
    expect(meta.title.trim()).not.toBe("")
    expect(meta.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(new Date(`${meta.updated}T00:00:00Z`).getTime())).toBe(false)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it("prefixes a failure with the file it came from", () => {
    expect(() => loadStory("content/intro/missing.md")).toThrow(/content\/intro\/missing\.md/)
  })
})
