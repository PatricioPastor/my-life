import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseStory } from "./parse-story"
import type { Story } from "./types"

/**
 * Read and parse a story file, relative to the project root. Server-only (it uses `fs`): call it from a Server Component.
 * Static routes read it at build time, but a Server Action that sets cookies re-renders the route at request time, so
 * the file must also ship with the function (`outputFileTracingIncludes` in `next.config.ts`). A parse failure
 * propagates and fails the build with the parser's message.
 */
export function loadStory(relativePath: string): Story {
  // The bundler cannot trace this dynamic path; next.config.ts includes the content folder explicitly.
  const file = join(/*turbopackIgnore: true*/ process.cwd(), relativePath)
  try {
    return parseStory(readFileSync(file, "utf8"))
  } catch (e) {
    if (e instanceof Error) e.message = `${relativePath}: ${e.message}`
    throw e
  }
}
