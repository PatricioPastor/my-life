import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import nextConfig from "../../../next.config"

// Server Actions that set cookies (the gate's session) re-render "/" at request time, so the story file is read on the
// server, not only at build. It must ship inside the serverless function, or production fails with ENOENT.
describe("content tracing", () => {
  it("ships the content folder with the home route", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/"]).toContain("./content/**/*.md")
    expect(existsSync("content/intro/por-que-cree-esto.md")).toBe(true)
  })

  it("ships the case studies with it too: Proyectos reads them on the same render", () => {
    // ./content/**/*.md already covers content/projects; this pins that a narrower glob would not drop them.
    expect(nextConfig.outputFileTracingIncludes?.["/"]).toContain("./content/**/*.md")
    expect(existsSync("content/projects/voltaicco.md")).toBe(true)
  })

  it("ships the case studies with /trabajo and its deep links, which read them too", () => {
    for (const route of ["/trabajo", "/trabajo/[slug]"]) {
      expect(nextConfig.outputFileTracingIncludes?.[route]).toContain("./content/projects/**/*.md")
    }
  })
})
