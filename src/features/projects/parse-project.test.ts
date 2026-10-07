import { describe, expect, it } from "vitest"
import { StoryParseError } from "@/shared/content"
import { collectProjects, parseProject } from "./parse-project"

const FIELDS: Record<string, string> = {
  slug: "slug: consola",
  title: "title: Consola",
  updated: "updated: 2026-10-06",
  role: "role: Diseño y desarrollo",
  period: 'period: "2026"',
  summary: "summary: Una consola para vigilar una flota.",
  stack: "stack: [Next.js 16, React 19]",
  order: "order: 1",
}

/** A project file; `patch` replaces (or, with null, drops) frontmatter lines by field. */
function project(patch: Record<string, string | null> = {}, body = "Un párrafo.\n\n---\n\n## Cómo\n\nOtro *párrafo*.") {
  const lines = Object.entries({ ...FIELDS, ...patch }).flatMap(([, line]) => (line === null ? [] : [line]))
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`
}

function failure(markdown: string): StoryParseError {
  try {
    parseProject(markdown)
  } catch (e) {
    expect(e).toBeInstanceOf(StoryParseError)
    return e as StoryParseError
  }
  throw new Error("expected parseProject to throw")
}

describe("parseProject", () => {
  it("reads the frontmatter fields and the story blocks", () => {
    const { meta, blocks } = parseProject(project())
    expect(meta).toEqual({
      slug: "consola",
      title: "Consola",
      updated: "2026-10-06",
      role: "Diseño y desarrollo",
      period: "2026",
      summary: "Una consola para vigilar una flota.",
      stack: ["Next.js 16", "React 19"],
      order: 1,
    })
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "break", "subheading", "paragraph"])
  })

  it("reads a year written without quotes as the period", () => {
    expect(parseProject(project({ period: "period: 2026" })).meta.period).toBe("2026")
  })

  it.each(["slug", "role", "period", "summary", "stack", "order"])("requires %s", (field) => {
    const error = failure(project({ [field]: null }))
    expect(error.construct).toBe("frontmatter")
    expect(error.message).toContain(`"${field}"`)
  })

  it("still requires the story fields", () => {
    expect(failure(project({ updated: null })).message).toContain('"updated"')
  })

  it("rejects a slug that is not URL-safe", () => {
    for (const slug of ["Consola", "mi consola", "consola-", "con--sola", "consolá"]) {
      expect(failure(project({ slug: `slug: "${slug}"` })).message).toContain('"slug"')
    }
  })

  it("rejects blank text fields", () => {
    expect(failure(project({ role: 'role: "  "' })).message).toContain('"role"')
    expect(failure(project({ summary: "summary: 42" })).message).toContain('"summary"')
  })

  it("rejects a stack that is not a list of names", () => {
    expect(failure(project({ stack: "stack: Next.js" })).message).toContain('"stack"')
    expect(failure(project({ stack: "stack: []" })).message).toContain('"stack"')
    expect(failure(project({ stack: 'stack: [Next.js, ""]' })).message).toContain('"stack"')
  })

  it("rejects an order that is not a whole number", () => {
    expect(failure(project({ order: "order: 1.5" })).message).toContain('"order"')
    expect(failure(project({ order: 'order: "1"' })).message).toContain('"order"')
  })

  it("requires some text in the body", () => {
    expect(failure(project({}, "")).message).toMatch(/body/)
    expect(failure(project({}, "---")).message).toMatch(/body/)
  })

  it("rejects what the story subset rejects", () => {
    expect(failure(project({}, "- una lista")).construct).toBe("list")
  })
})

describe("parseProject: the logo and the mark", () => {
  it("reads an optional logo and mark, each a path to an SVG under /projects/", () => {
    const { meta } = parseProject(project({ logo: "logo: /projects/consola/logo.svg", mark: "mark: /projects/consola/mark.svg" }))
    expect(meta.logo).toBe("/projects/consola/logo.svg")
    expect(meta.mark).toBe("/projects/consola/mark.svg")
  })

  it("leaves both out of a project that has neither, which keeps its name as text", () => {
    const { meta } = parseProject(project())
    expect("logo" in meta).toBe(false)
    expect("mark" in meta).toBe(false)
  })

  it.each(["logo", "mark"])("rejects a %s that is not a path to an SVG under /projects/", (field) => {
    const bad = [
      `${field}:`,
      `${field}: ""`,
      `${field}: 42`,
      `${field}: [/projects/consola/a.svg]`,
      `${field}: /projects/consola/logo.png`,
      `${field}: projects/consola/logo.svg`,
      `${field}: /brand/logo.svg`,
      `${field}: https://example.com/projects/logo.svg`,
      `${field}: /projects/../secret.svg`,
      `${field}: /projects/consola//logo.svg`,
      `${field}: /projects/consola/Logo.svg`,
      `${field}: /projects/consola/logo.svg?v=2`,
    ]
    for (const line of bad) {
      const error = failure(project({ [field]: line }))
      expect(error.construct).toBe("frontmatter")
      expect(error.message).toContain(`"${field}"`)
    }
  })
})

describe("collectProjects", () => {
  const file = (path: string, patch: Record<string, string | null>) => ({ path, markdown: project(patch) })

  it("sorts the projects by order", () => {
    const projects = collectProjects([
      file("content/projects/b.md", { slug: "slug: b", order: "order: 2" }),
      file("content/projects/a.md", { slug: "slug: a", order: "order: 1" }),
    ])
    expect(projects.map((p) => p.meta.slug)).toEqual(["a", "b"])
  })

  it("prefixes a failure with the file it came from", () => {
    expect(() => collectProjects([file("content/projects/a.md", { role: null })])).toThrow(/^content\/projects\/a\.md: .*"role"/)
  })

  it("rejects two projects with one slug", () => {
    expect(() =>
      collectProjects([
        file("content/projects/a.md", { slug: "slug: a", order: "order: 1" }),
        file("content/projects/b.md", { slug: "slug: a", order: "order: 2" }),
      ]),
    ).toThrow(/content\/projects\/b\.md: .*slug "a".*content\/projects\/a\.md/)
  })

  it("rejects two projects with one order, so the list never depends on file names", () => {
    expect(() =>
      collectProjects([
        file("content/projects/a.md", { slug: "slug: a", order: "order: 1" }),
        file("content/projects/b.md", { slug: "slug: b", order: "order: 1" }),
      ]),
    ).toThrow(/content\/projects\/b\.md: .*order 1.*content\/projects\/a\.md/)
  })

  it("accepts no projects at all", () => {
    expect(collectProjects([])).toEqual([])
  })
})
