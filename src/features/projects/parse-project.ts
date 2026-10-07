import { frontmatterError, parseContent, StoryParseError, type Block, type StoryMeta } from "@/shared/content"
import type { StackGroup } from "./tech"

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
  /** The main tools by category, categories and tools in the order they read best; a tool appears once. */
  stack: StackGroup<string>[]
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

const STACK_SHAPE = "one category per line, each with its list of names, e.g. Frontend: [Next.js, React]"

// The YAML reads the categories into an object, which keeps the order written except for a name that is a whole
// number: that one would be listed first. Such a name is refused rather than moved.
const WHOLE_NUMBER = /^\d+$/

/**
 * The stack: a map of categories, in the order written, each a non-empty list of names. A category and a name each
 * appear once, a name across the whole stack.
 */
function stackGroups(value: unknown): StackGroup<string>[] {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    throw invalid(`"stack" is required and must be ${STACK_SHAPE}.`)
  }
  const categoryOf = new Map<string, string>()
  const groups: StackGroup<string>[] = []
  for (const [key, items] of Object.entries(value)) {
    const name = key.trim()
    if (name === "") throw invalid(`"stack" has a category with no name; it must be ${STACK_SHAPE}.`)
    if (WHOLE_NUMBER.test(name)) throw invalid(`"stack": a category's name cannot be a number alone, got ${JSON.stringify(name)}.`)
    if (groups.some((g) => g.name === name)) throw invalid(`"stack" lists the category ${JSON.stringify(name)} twice.`)
    if (!Array.isArray(items) || items.length === 0 || !items.every((s) => typeof s === "string" && s.trim() !== "")) {
      throw invalid(`"stack": the category ${JSON.stringify(name)} must be a non-empty list of names, e.g. [Next.js, React].`)
    }
    const names = items.map((s: string) => s.trim())
    for (const tech of names) {
      const first = categoryOf.get(tech)
      if (first === name) throw invalid(`"stack" lists ${JSON.stringify(tech)} twice in ${JSON.stringify(name)}.`)
      if (first !== undefined) throw invalid(`"stack" lists ${JSON.stringify(tech)} in both ${JSON.stringify(first)} and ${JSON.stringify(name)}.`)
      categoryOf.set(tech, name)
    }
    groups.push({ name, items: names })
  }
  return groups
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

  const stack = stackGroups(fields.stack)
  const { order } = fields
  if (typeof order !== "number" || !Number.isInteger(order)) {
    throw invalid(`"order" is required and must be a whole number, got ${JSON.stringify(order)}.`)
  }
  const pictures = { ...svgPath(fields, "logo"), ...svgPath(fields, "mark") }

  if (!blocks.some((b) => b.type !== "break")) {
    throw new StoryParseError("Empty body: a project needs its text below the frontmatter.", "body", 1)
  }

  return {
    meta: { ...meta, slug, role, period, summary, stack, order, ...pictures },
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
