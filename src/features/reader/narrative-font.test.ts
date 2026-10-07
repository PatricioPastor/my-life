import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SWITZER_CSS } from "./narrative-font"

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
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n")
    expect(files.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f))).toEqual([])
  })
})
