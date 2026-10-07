import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

/** The body of the first block opened by `at`, nested braces included. */
function blockAt(at: string, from = 0): string {
  const start = css.indexOf("{", css.indexOf(at, from))
  let depth = 0
  let i = start
  do {
    if (css[i] === "{") depth++
    else if (css[i] === "}") depth--
    i++
  } while (depth > 0 && i < css.length)
  return css.slice(start, i)
}
const rule = (block: string, selector: string) =>
  new RegExp(`(^|[\\s,}])${selector.replace(/[.*+?^${}()|[\]\\:-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block)?.[2] ?? ""

describe("scrollbars", () => {
  // Outside forced colors only: there, the system draws its own.
  const bars = blockAt("@media (forced-colors: none)", css.indexOf("Scrollbars"))

  it("are set site-wide, as a base style any component can still override (or hide)", () => {
    const layer = css.lastIndexOf("@layer base", css.indexOf("@media (forced-colors: none)"))
    expect(layer).toBeGreaterThanOrEqual(0)
    expect(blockAt("@layer base", layer)).toContain(bars)
  })

  it("draw a narrow track with nothing on it, in the size token", () => {
    expect(css).toMatch(/--scrollbar-size:\s*\d+px;/)
    expect(rule(bars, "::-webkit-scrollbar")).toMatch(/width: var\(--scrollbar-size\);/)
    expect(rule(bars, "::-webkit-scrollbar")).toMatch(/height: var\(--scrollbar-size\);/)
    expect(rule(bars, "::-webkit-scrollbar-track")).toMatch(/background: transparent;/)
    expect(rule(bars, "::-webkit-scrollbar-corner")).toMatch(/background: transparent;/)
  })

  // The ink's faint token, read where each scrollbar is (so it follows the sky's ink), mixed thinner at rest.
  const AT_REST = "color-mix(in oklab, var(--ink-faint, rgba(246, 226, 232, 0.24)) 60%, transparent)"
  const BRIGHTER = "var(--ink-faint, rgba(246, 226, 232, 0.24))"

  it("draw a square thumb in a faint ink, a little brighter under the pointer and while dragged", () => {
    const thumb = rule(bars, "::-webkit-scrollbar-thumb")
    expect(thumb).toMatch(/border-radius: 0;/)
    expect(thumb).toContain(`background-color: ${AT_REST};`)
    expect(rule(bars, "::-webkit-scrollbar-thumb:hover")).toContain(`background-color: ${BRIGHTER};`)
    expect(rule(bars, "::-webkit-scrollbar-thumb:active")).toContain(`background-color: ${BRIGHTER};`)
  })

  it("use the standard properties where the pseudo-elements do not exist, so the two never fight", () => {
    const standard = blockAt("@supports not selector(::-webkit-scrollbar)", css.indexOf("Scrollbars"))
    expect(bars).toContain(standard)
    expect(standard).toMatch(/scrollbar-width: thin;/)
    expect(standard).toContain(`scrollbar-color: ${AT_REST} transparent;`)
    // Outside that guard, setting them would switch Chromium's pseudo-elements off.
    expect(bars.replace(standard, "")).not.toMatch(/scrollbar-(width|color):/)
  })
})
