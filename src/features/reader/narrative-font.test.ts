import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { SWITZER_CSS } from "./narrative-font"

/** A font file, in any format a browser or a desktop loads. */
const FONT = /\.(woff2?|ttf|otf|eot)$/i
/** Folders never entered, wherever they are: dependencies, version control, and what tools and builds write. */
const SKIP_ANYWHERE = new Set(["node_modules", ".git", ".next", ".codegraph", ".vercel", ".turbo", ".pnpm-store"])
/**
 * Folders never entered at the repository's root, all ignored by git: build and test output, and resources/, the
 * local-only assets (.gitignore keeps licensed font files there, never published).
 */
const SKIP_AT_ROOT = new Set(["out", "build", "coverage", "resources"])

/**
 * Every font file under `root`, as a path relative to it, found by walking the folders themselves: no git, so it holds
 * in any checkout or copy. Links are never followed.
 */
function fontFilesUnder(root: string, dir = ""): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIP_ANYWHERE.has(entry.name) && !(dir === "" && SKIP_AT_ROOT.has(entry.name))) found.push(...fontFilesUnder(root, path))
    } else if (entry.isFile() && FONT.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

describe("the narrative face", () => {
  it("comes from Fontshare's CSS API, roman and italic variable, swapping in when it arrives", () => {
    expect(SWITZER_CSS).toBe("https://api.fontshare.com/v2/css?f[]=switzer@1,2&display=swap")
  })

  it("is a theme token: Switzer first, then a sans fallback", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
    const token = /--font-narrative:\s*([^;]+);/.exec(css)?.[1] ?? ""
    expect(token).toMatch(/^"Switzer",/)
    expect(token).toMatch(/sans-serif$/)
  })

  // Fontshare's license (ITF FFL v2.0) forbids distributing the font files through a repository or a public server,
  // and this repository is public: the face is only ever served by Fontshare's API.
  it("never ships a font file in the repository", () => {
    expect(fontFilesUnder(process.cwd())).toEqual([])
  })
})

describe("the font file guard", () => {
  it("finds a font file wherever it is, in any format, but never in dependencies, build output or local-only assets", () => {
    const root = mkdtempSync(join(tmpdir(), "font-guard-"))
    try {
      const files = [
        "public/fonts/Switzer-Variable.woff2",
        "src/a/b/face.WOFF",
        "face.ttf",
        "deep/face.otf",
        "legacy/face.eot",
        "src/fonts.ts",
        "node_modules/pkg/face.woff2",
        "src/node_modules/face.woff2",
        ".next/static/media/face.woff2",
        ".git/objects/face.ttf",
        ".codegraph/face.otf",
        "resources/Switzer.otf",
        "coverage/face.woff",
      ]
      for (const file of files) {
        mkdirSync(dirname(join(root, file)), { recursive: true })
        writeFileSync(join(root, file), "")
      }
      expect(fontFilesUnder(root).sort()).toEqual(["deep/face.otf", "face.ttf", "legacy/face.eot", "public/fonts/Switzer-Variable.woff2", "src/a/b/face.WOFF"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("still looks in a folder named like a local-only one when it is not at the root", () => {
    const root = mkdtempSync(join(tmpdir(), "font-guard-"))
    try {
      mkdirSync(join(root, "public/resources"), { recursive: true })
      writeFileSync(join(root, "public/resources/face.woff2"), "")
      expect(fontFilesUnder(root)).toEqual(["public/resources/face.woff2"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
