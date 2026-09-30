import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseStory } from "./parse-story"
import type { Story } from "./types"

/**
 * Read and parse a story file, relative to the project root. Server-only (it uses `fs`): call it from a Server Component,
 * so the file is read at build time for static routes. A parse failure propagates and fails the build with the parser's message.
 */
export function loadStory(relativePath: string): Story {
  // Runs at build time only (the route is static), so there is nothing for the bundler to trace.
  const file = join(/*turbopackIgnore: true*/ process.cwd(), relativePath)
  try {
    return parseStory(readFileSync(file, "utf8"))
  } catch (e) {
    if (e instanceof Error) e.message = `${relativePath}: ${e.message}`
    throw e
  }
}
