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
  stack: "stack:\n  Frontend: [Next.js 16, React 19]\n  Testing: [Vitest]",
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
      stack: [
        { name: "Frontend", items: ["Next.js 16", "React 19"] },
        { name: "Testing", items: ["Vitest"] },
      ],
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

describe("parseProject: the stack by category", () => {
  const stack = (...lines: string[]) => parseProject(project({ stack: ["stack:", ...lines].join("\n") })).meta.stack
  const stackFailure = (...lines: string[]) => failure(project({ stack: ["stack:", ...lines].join("\n") }))

  it("keeps the categories in the order written, not sorted", () => {
    expect(stack("  Zeta: [a]", "  Alfa: [b]", "  Media: [c]").map((g) => g.name)).toEqual(["Zeta", "Alfa", "Media"])
  })

  it("keeps each category's technologies in the order written, a list on one line or one per line", () => {
    expect(stack("  Backend:", "    - Prisma 7", "    - Neon Postgres", "  Frontend: [React 19, Next.js 16]")).toEqual([
      { name: "Backend", items: ["Prisma 7", "Neon Postgres"] },
      { name: "Frontend", items: ["React 19", "Next.js 16"] },
    ])
  })

  it("trims the names it reads", () => {
    expect(stack('  " Backend ": [" Prisma 7 "]')).toEqual([{ name: "Backend", items: ["Prisma 7"] }])
  })

  it("rejects the old flat list and anything else that is not categories, naming the shape it wants", () => {
    for (const lines of [["  - Next.js 16", "  - React 19"], [" Next.js"], [" {}"], [" []"]]) {
      const error = stackFailure(...lines)
      expect(error.construct).toBe("frontmatter")
      expect(error.message).toContain('"stack"')
      expect(error.message).toContain("Frontend: [Next.js, React]")
    }
  })

  it("rejects a category with no technologies, or with something other than a list of names", () => {
    for (const line of ["  Backend: []", "  Backend:", "  Backend: Prisma 7", '  Backend: [Prisma 7, ""]', "  Backend: [Prisma 7, 42]", "  Backend: [[Prisma 7]]"]) {
      const error = stackFailure(line)
      expect(error.message).toContain('"stack"')
      expect(error.message).toContain('"Backend"')
    }
  })

  it("rejects a category with no name", () => {
    expect(stackFailure('  "": [Vitest]').message).toContain('"stack"')
    expect(stackFailure('  "  ": [Vitest]').message).toContain('"stack"')
  })

  // A whole number as a key would be listed first whatever its place in the file, so the order could not be kept.
  it("rejects a category named by a number alone", () => {
    expect(stackFailure("  Backend: [Prisma 7]", "  2024: [Vitest]").message).toMatch(/"stack".*"2024"/)
  })

  it("rejects a category written twice", () => {
    expect(stackFailure("  Backend: [Prisma 7]", "  Backend: [Neon Postgres]").construct).toBe("frontmatter")
    expect(stackFailure("  Backend: [Prisma 7]", '  " Backend": [Neon Postgres]').message).toMatch(/"stack".*"Backend"/)
  })

  it("rejects a technology listed twice, in one category or in two", () => {
    expect(stackFailure("  Backend: [Prisma 7, Prisma 7]").message).toMatch(/"stack".*"Prisma 7"/)
    expect(stackFailure("  Backend: [Prisma 7]", "  Datos: [Neon Postgres, Prisma 7]").message).toMatch(/"stack".*"Prisma 7".*"Backend".*"Datos"/)
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
    expect(() => collectProjects([file("content/projects/a.md", { stack: "stack:\n  Backend: []" })])).toThrow(
      /^content\/projects\/a\.md: .*"stack"/,
    )
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
