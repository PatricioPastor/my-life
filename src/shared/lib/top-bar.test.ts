import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BAR_CONTROL, BAR_LEFT, BAR_RIGHT, BAR_TITLE, BAR_TOP } from "./top-bar"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

/** The value of `--name` in the first block of globals.css that declares it (the phone values come first). */
function token(name: string, from = css): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(from)
  if (!m) throw new Error(`token --${name} not found`)
  return m[1].trim()
}

/** The body of the `@variant md { ... }` block that holds the bar's desktop values. */
function mdBlock(): string {
  const at = css.indexOf("--bar-x:")
  const open = css.indexOf("@variant md {", at)
  if (at < 0 || open < 0) throw new Error("the bar has no md values")
  return css.slice(open, css.indexOf("}", open))
}

describe("the top bar", () => {
  it("sits under the status bar and the notch, closer to the edge on a phone than on a desktop", () => {
    expect(token("bar-top")).toContain("env(safe-area-inset-top)")
    expect(Number.parseFloat(token("bar-y", mdBlock()))).toBeGreaterThan(Number.parseFloat(token("bar-y")))
    expect(Number.parseFloat(token("bar-x", mdBlock()))).toBeGreaterThan(Number.parseFloat(token("bar-x")))
  })

  it("keeps clear of a side notch on both sides", () => {
    expect(token("bar-left")).toContain("env(safe-area-inset-left)")
    expect(token("bar-right")).toContain("env(safe-area-inset-right)")
  })

  it("mirrors the right side on the left one at every size: the same distances, each against its own notch", () => {
    expect(token("bar-right")).toBe(token("bar-left").replace("inset-left", "inset-right"))
    // The desktop values change the shared distances, never one side alone.
    expect(mdBlock()).not.toMatch(/--bar-(left|right):/)
  })

  it("places its controls with the shared tokens, one class per edge", () => {
    expect(BAR_TOP).toBe("top-(--bar-top)")
    expect(BAR_LEFT).toBe("left-(--bar-left)")
    expect(BAR_RIGHT).toBe("right-(--bar-right)")
  })

  it("gives every control of the bar one row, one padding, one type and one tracking", () => {
    const classes = BAR_CONTROL.split(" ")
    for (const c of ["h-(--bar-row)", "px-(--bar-pad)", "items-center", "text-xs", "tracking-[0.08em]", "text-ink-muted", "press"]) {
      expect(classes).toContain(c)
    }
    expect(token("bar-row")).toBe("3rem")
    expect(token("bar-pad")).toBe("0.75rem")
  })

  it("puts a title under the bar from the shared tokens: the row's top, plus its height, plus one named gap", () => {
    expect(BAR_TITLE).toContain("top-[calc(var(--bar-top)+var(--bar-row)+var(--bar-gap))]")
    expect(token("bar-gap")).toMatch(/^\d/)
  })

  it("lines a title up with the chevron's ink, not with its box: the bar's side, its padding, the chevron's inset, less the glyph's bearing", () => {
    expect(BAR_TITLE).toContain("left-[calc(var(--bar-left)+var(--bar-pad)+var(--bar-ink)-var(--title-bearing))]")
    // The chevron's tip is at x 4 of its 14 px box, less half its miter (0.75 / sin 45°): about 3 px in.
    expect(token("bar-ink")).toBe("3px")
    // A side bearing scales with the title's own size.
    expect(token("title-bearing")).toMatch(/em$/)
  })

  it("spells out no inset of its own: every number lives in the tokens", () => {
    for (const classes of [BAR_TOP, BAR_LEFT, BAR_RIGHT, BAR_CONTROL, BAR_TITLE]) {
      expect(classes).not.toMatch(/\d+(\.\d+)?rem|env\(/)
    }
  })
})
