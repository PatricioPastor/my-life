import { frontmatterError, parseContent, StoryParseError, type Block, type StoryMeta } from "@/shared/content"

/** A case study's structured fields, from its frontmatter; title and updated are a story's. */
export interface ProjectMeta extends StoryMeta {
  /** The project's id in links: lowercase letters and digits, words joined by single hyphens. */
  slug: string
  /** What I did on it, e.g. "Diseño y desarrollo". */
  role: string
  /** When, as written: "2026", "2024–2026". */
  period: string
  /** One sentence about the project. */
  summary: string
  /** The main tools, in the order they read best. */
  stack: string[]
  /** Place in the Proyectos list, lowest first. */
  order: number
  /** The full logo, mark and name, heading the case study in place of its title: a site path to an SVG in public/projects. */
  logo?: string
  /** The logo's mark alone, set beside the name in the Proyectos list: a site path to an SVG in public/projects. */
  mark?: string
}

/** A case study: its fields and its text, in the story subset. Plain data, so it crosses from the server to the client. */
export interface Project {
  meta: ProjectMeta
  blocks: Block[]
}

/** One project file as read from disk, its path kept for error messages. */
export interface ProjectFile {
  path: string
  markdown: string
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// A file in public/projects, by its site path: folders and a name in slug words, so nothing can climb out of it.
const SVG_PATH = /^\/projects\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/

// The frontmatter always opens the file, so its failures point at line 1.
const invalid = (detail: string) => frontmatterError(detail, 1)

function text(fields: Readonly<Record<string, unknown>>, name: string): string {
  const value = fields[name]
  if (typeof value !== "string" || value.trim() === "") throw invalid(`"${name}" is required and must be a non-empty string.`)
  return value.trim()
}

/** An optional picture: absent stays absent; anything written must be the site path to an SVG in public/projects. */
function svgPath(fields: Readonly<Record<string, unknown>>, name: "logo" | "mark"): Partial<Record<"logo" | "mark", string>> {
  const value = fields[name]
  if (value === undefined) return {}
  if (typeof value !== "string" || !SVG_PATH.test(value)) {
    throw invalid(
      `"${name}" must be the path to an SVG in public/projects, in lowercase words joined by hyphens, e.g. /projects/voltaicco/${name}.svg; got ${JSON.stringify(value)}.`,
    )
  }
  return { [name]: value }
}

/**
 * Parse a project file: a story (title, updated, the subset's blocks) whose frontmatter also carries the project's fields.
 * A missing or malformed field, or an empty body, throws a {@link StoryParseError} that fails the build, like a story.
 */
export function parseProject(markdown: string): Project {
  const { meta, blocks, fields } = parseContent(markdown)

  const slug = text(fields, "slug")
  if (!SLUG.test(slug)) {
    throw invalid(`"slug" must be lowercase letters and digits, words joined by single hyphens, got ${JSON.stringify(slug)}.`)
  }
  const role = text(fields, "role")
  // A bare year is a number in YAML; it reads as the period all the same.
  const period = Number.isInteger(fields.period) ? String(fields.period) : text(fields, "period")
  const summary = text(fields, "summary")

  const { stack, order } = fields
  if (!Array.isArray(stack) || stack.length === 0 || !stack.every((s) => typeof s === "string" && s.trim() !== "")) {
    throw invalid('"stack" is required and must be a list of names, e.g. [Next.js, React].')
  }
  if (typeof order !== "number" || !Number.isInteger(order)) {
    throw invalid(`"order" is required and must be a whole number, got ${JSON.stringify(order)}.`)
  }
  const pictures = { ...svgPath(fields, "logo"), ...svgPath(fields, "mark") }

  if (!blocks.some((b) => b.type !== "break")) {
    throw new StoryParseError("Empty body: a project needs its text below the frontmatter.", "body", 1)
  }

  return {
    meta: { ...meta, slug, role, period, summary, stack: stack.map((s: string) => s.trim()), order, ...pictures },
    blocks,
  }
}

/**
 * Parse every project file and sort them by order. A failure is prefixed with the file it came from; two projects with one
 * slug (one link) or one order (an order left to file names) fail too.
 */
export function collectProjects(files: readonly ProjectFile[]): Project[] {
  const seen: { path: string; project: Project }[] = []
  for (const { path, markdown } of files) {
    let project: Project
    try {
      project = parseProject(markdown)
    } catch (e) {
      if (e instanceof Error) e.message = `${path}: ${e.message}`
      throw e
    }
    const { slug, order } = project.meta
    const sameSlug = seen.find((s) => s.project.meta.slug === slug)
    if (sameSlug) throw new Error(`${path}: slug "${slug}" is already used by ${sameSlug.path}.`)
    const sameOrder = seen.find((s) => s.project.meta.order === order)
    if (sameOrder) throw new Error(`${path}: order ${order} is already used by ${sameOrder.path}.`)
    seen.push({ path, project })
  }
  return seen.map((s) => s.project).sort((a, b) => a.meta.order - b.meta.order)
}
