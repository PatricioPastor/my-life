import "server-only"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { collectProjects, type Project } from "./parse-project"

/** Where the case studies live, relative to the project root: one Markdown file per project. */
export const PROJECTS_DIR = "content/projects"

/**
 * Read and parse every case study, sorted by order. Server-only (it uses `fs`): call it from a Server Component, like
 * `loadStory`, and hand the result to the client as props. The files must ship with the function too
 * (`outputFileTracingIncludes` in `next.config.ts`). A bad file fails the build with its path and the parser's message.
 */
export function loadProjects(dir: string = PROJECTS_DIR): Project[] {
  try {
    // The bundler cannot trace this dynamic path; next.config.ts includes the content folder explicitly.
    const root = join(/*turbopackIgnore: true*/ process.cwd(), dir)
    const names = readdirSync(root)
      .filter((name) => name.endsWith(".md"))
      .sort()
    return collectProjects(names.map((name) => ({ path: `${dir}/${name}`, markdown: readFileSync(join(root, name), "utf8") })))
  } catch (e) {
    if (e instanceof Error && !e.message.startsWith(`${dir}/`)) e.message = `${dir}: ${e.message}`
    throw e
  }
}
