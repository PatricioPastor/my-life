import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { loadProjects } from "./load-projects"

const projects = loadProjects()

/** Every logo and mark the shipped case studies point at, with the file in public/ that serves it. */
const pictures = projects.flatMap(({ meta }) =>
  [meta.logo, meta.mark].flatMap((path) => (path === undefined ? [] : [{ slug: meta.slug, path, file: `public${path}` }])),
)

// A path that parses but points at nothing would ship a broken image: the build would not notice, so this does.
describe("the case studies' logos and marks", () => {
  it("heads Voltaicco with its logo and marks it in the Proyectos list", () => {
    const voltaicco = projects.find((p) => p.meta.slug === "voltaicco")?.meta
    expect(voltaicco?.logo).toBeDefined()
    expect(voltaicco?.mark).toBeDefined()
  })

  it.each(pictures)("ships $path, which $slug points at, under public/", ({ file }) => {
    expect(existsSync(file)).toBe(true)
  })

  // public/ serves the file on the site's own origin, where an SVG opened directly could run a script.
  it.each(pictures)("ships $path as a clean vector: a viewBox, no Figma ids or styles, nothing that runs", ({ file }) => {
    const svg = readFileSync(file, "utf8")
    expect(svg).toMatch(/<svg[^>]*\sviewBox="[^"]+"/)
    expect(svg).not.toMatch(/preserveAspectRatio|\sid=|\sstyle=|<script|<foreignObject|\son\w+=|javascript:/i)
  })
})
