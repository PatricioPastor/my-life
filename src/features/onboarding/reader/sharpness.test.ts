import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

/** The body of every rule for a selector, wherever it sits (top level or inside an @media block). */
const rules = (selector: string): string[] => {
  const out: string[] = []
  const needle = `${selector} {`
  for (let at = css.indexOf(needle); at >= 0; at = css.indexOf(needle, at + 1)) {
    // Only a match that starts its line (after indentation) is a rule for exactly this selector, not the tail of a longer one.
    const lineStart = css.lastIndexOf("\n", at) + 1
    if (css.slice(lineStart, at).trim() !== "") continue
    out.push(css.slice(at, css.indexOf("}", at)))
  }
  if (out.length === 0) throw new Error(`no rule for ${selector}`)
  return out
}
const rule = (selector: string): string => rules(selector)[0]!
const FILL = /\b(both|forwards)\b/

describe("text sharpness rules", () => {
  it("lays blocks out at the focused size, never divided by the focus scale", () => {
    const block = rule(".rd-block")
    expect(block).toMatch(/width:\s*100%/)
    expect(block).toMatch(/font-size:\s*var\(--rd-fs\)/)
  })

  it("fills painted words with the ink itself and drops their stroke", () => {
    const painted = rule(".rd-w[data-p]")
    expect(painted).toMatch(/color:\s*var\(--ink\)/)
    expect(painted).toMatch(/-webkit-text-stroke-width:\s*0/)
  })

  it("does not hold a finished animation on the containers of text (fill-mode backwards only)", () => {
    // These three rules carry an `animation` shorthand: check it is there, so the guard cannot pass on an empty match.
    for (const s of [".rd-stage", ".ob-hw", ".ob-story"]) {
      for (const r of rules(s)) if (/animation:/.test(r)) expect(r, s).not.toMatch(FILL)
      expect(rules(s).some((r) => /animation:/.test(r)), s).toBe(true)
    }
  })

  it("lets letters animate in with fill backwards only, in every rule that animates them (media queries included)", () => {
    // The exit animation may hold its hidden end state with forwards; the entrance must not.
    const letterRules = [...rules('.ob-line[data-on="true"] .ob-letter'), ...rules('.ob-line[data-on="true"][data-exit="true"] .ob-letter')]
    expect(letterRules.length).toBeGreaterThanOrEqual(4)
    for (const r of letterRules) {
      const entrance = r.split(",").filter((part) => /ob-letter-in|ob-letter-fade(?!-out)/.test(part))
      expect(entrance.length).toBeGreaterThan(0)
      for (const part of entrance) expect(part, r).not.toMatch(FILL)
    }
  })

  it("ends the rise keyframes with filter none, not a zero blur", () => {
    const at = css.indexOf("@keyframes rise")
    expect(css.slice(at, css.indexOf("@keyframes turn"))).not.toMatch(/blur\(0\)/)
  })

  it("keeps no permanent will-change on the reader title", () => {
    for (const r of rules(".ob-title")) expect(r).not.toMatch(/will-change/)
  })

  it("asks for legible, grayscale-smoothed text on the onboarding layer", () => {
    const ob = rule(".ob")
    expect(ob).toMatch(/text-rendering:\s*optimizeLegibility/)
    expect(ob).toMatch(/-webkit-font-smoothing:\s*antialiased/)
    expect(ob).toMatch(/-moz-osx-font-smoothing:\s*grayscale/)
  })
})
