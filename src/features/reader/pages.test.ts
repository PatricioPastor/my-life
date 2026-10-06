import { describe, expect, it } from "vitest"
import type { Block } from "@/shared/content"
import { pagesOf } from "./pages"

const p = (text: string): Block => ({ type: "paragraph", runs: [{ kind: "text", text }] })
const cut: Block = { type: "break" }

describe("pagesOf", () => {
  it("keeps a text without breaks on one page", () => {
    expect(pagesOf([p("a"), p("b")])).toEqual([[p("a"), p("b")]])
  })

  it("turns the page at each break, which never shows itself", () => {
    expect(pagesOf([p("a"), cut, { type: "subheading", text: "dos" }, p("b"), cut, p("c")])).toEqual([
      [p("a")],
      [{ type: "subheading", text: "dos" }, p("b")],
      [p("c")],
    ])
  })

  it("leaves no blank page for a break at either end or two in a row", () => {
    expect(pagesOf([cut, p("a"), cut, cut, p("b"), cut])).toEqual([[p("a")], [p("b")]])
  })
})
