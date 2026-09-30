import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`no rule for ${selector}`)
  return css.slice(at, css.indexOf("}", at))
}

describe("text sharpness rules", () => {
  it("lays blocks out at the focused size, never divided by the focus scale", () => {
    const block = rule("  .rd-block")
    expect(block).toMatch(/width:\s*100%/)
    expect(block).toMatch(/font-size:\s*var\(--rd-fs\)/)
  })

  it("fills painted words with the ink itself and drops their stroke", () => {
    const painted = rule("  .rd-w[data-p]")
    expect(painted).toMatch(/color:\s*var\(--ink\)/)
    expect(painted).toMatch(/-webkit-text-stroke-width:\s*0/)
  })

  it("does not hold a finished animation on text containers (fill-mode backwards only)", () => {
    for (const s of ["  .rd-stage", "  .ob-hw", "  .ob-story", '  .ob-line[data-on="true"] .ob-letter']) {
      expect(rule(s), s).not.toMatch(/\b(both|forwards)\b/)
    }
  })

  it("ends the rise keyframes with filter none, not a zero blur", () => {
    const at = css.indexOf("@keyframes rise")
    expect(css.slice(at, css.indexOf("@keyframes turn"))).not.toMatch(/blur\(0\)/)
  })

  it("keeps no permanent will-change on the reader title", () => {
    expect(rule("  .ob-title")).not.toMatch(/will-change/)
  })

  it("asks for legible, grayscale-smoothed text on the onboarding layer", () => {
    const ob = rule("  .ob")
    expect(ob).toMatch(/text-rendering:\s*optimizeLegibility/)
    expect(ob).toMatch(/-webkit-font-smoothing:\s*antialiased/)
    expect(ob).toMatch(/-moz-osx-font-smoothing:\s*grayscale/)
  })
})
