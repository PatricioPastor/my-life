import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { loadProjects } from "./load-projects"

// The case studies are the author's to rewrite: this checks the pipeline and the privacy line, never the wording.
// Parser and field behaviour live in parse-project.test.ts.
describe("loadProjects", () => {
  it("loads the shipped case studies, Voltaicco among them, in order", () => {
    const projects = loadProjects()
    expect(projects.map((p) => p.meta.slug)).toContain("voltaicco")
    const orders = projects.map((p) => p.meta.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it("prefixes a failure with the folder it came from", () => {
    expect(() => loadProjects("content/missing")).toThrow(/^content\/missing: /)
  })

  it("never puts a link, a web address or an e-mail address in a case study", () => {
    for (const name of readdirSync("content/projects")) {
      const text = readFileSync(`content/projects/${name}`, "utf8")
      expect(text).not.toMatch(/https?:\/\/|www\.|\.vercel\.app|[\w.+-]+@[\w-]+\.\w/)
    }
  })
})
