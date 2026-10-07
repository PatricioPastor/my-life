import { describe, expect, it } from "vitest"
import { svgHazards } from "./svg-guard"

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`

describe("svgHazards", () => {
  it("finds nothing in a plain vector", () => {
    expect(svgHazards(svg('<path d="M0 0h24v24H0z" fill="#fff"/>'))).toEqual([])
  })

  it.each([
    ["a script", svg("<script>alert(1)</script>")],
    ["a foreign object", svg("<foreignObject><div>hi</div></foreignObject>")],
    ["an event handler", svg('<rect onload="alert(1)" width="1" height="1"/>')],
    ["a javascript: URL", svg('<a href="javascript:alert(1)"><path d="M0 0"/></a>')],
  ])("flags %s", (_, file) => {
    expect(svgHazards(file)).not.toEqual([])
  })

  it.each([
    ["a fragment", '<use href="#shape"/>'],
    ["an old-style fragment", '<use xlink:href="#_Image3"/>'],
    ["an embedded PNG", '<image xlink:href="data:image/png;base64,iVBORw0KGgo="/>'],
    ["an embedded JPEG", "<image href='data:image/jpeg;base64,/9j/4AAQ'/>"],
    ["an embedded WebP", '<image href="data:image/webp;base64,UklGRg=="/>'],
  ])("lets a link to %s through: it stays inside the file", (_, body) => {
    expect(svgHazards(svg(body))).toEqual([])
  })

  it.each([
    ["another site", '<image href="https://example.com/a.png"/>'],
    ["another file", '<use xlink:href="sprite.svg#a"/>'],
    ["an embedded SVG, which could carry its own script", '<image href="data:image/svg+xml;base64,PHN2Zz4="/>'],
    ["an embedded page", "<image href='data:text/html,hi'/>"],
    ["nothing at all", '<a href=""><path d="M0 0"/></a>'],
  ])("flags a link to %s", (_, body) => {
    expect(svgHazards(svg(body))).not.toEqual([])
  })

  it("names what it found, so a failing check says where to look", () => {
    expect(svgHazards(svg('<image href="https://example.com/a.png"/>'))).toEqual(['href="https://example.com/a.png"'])
  })
})
