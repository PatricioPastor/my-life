import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

describe(".clip-overflow", () => {
  it("declares overflow: hidden first and overflow: clip after it, so a browser without clip (Safari before 16) keeps hidden", () => {
    const rule = /\.clip-overflow\s*\{([^}]*)\}/.exec(css)?.[1] ?? ""
    const hidden = rule.indexOf("overflow: hidden")
    const clip = rule.indexOf("overflow: clip")
    expect(hidden).toBeGreaterThanOrEqual(0)
    expect(clip).toBeGreaterThan(hidden)
  })
})
