import { existsSync, readdirSync, readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { loadProjects } from "./load-projects"
import { svgHazards } from "./svg-guard"
import { TECH, techFor } from "./tech"

/** Every stack name the shipped case studies list, in every category, as they write it. */
const stackNames = [...new Set(loadProjects().flatMap(({ meta }) => meta.stack.flatMap((group) => group.items)))]

const TECH_DIR = "public/tech"
const marks = readdirSync(TECH_DIR).filter((name) => name.endsWith(".svg"))
const read = (name: string) => readFileSync(`${TECH_DIR}/${name}`, "utf8")

describe("the technology registry", () => {
  it.each(stackNames)("knows %s, as a case study lists it", (name) => {
    expect(techFor(name)).toBeDefined()
  })

  it("maps the case studies' spellings to their technologies, versions and all", () => {
    const keys = Object.fromEntries(
      [
        "Next.js 16",
        "React 19",
        "TypeScript",
        "Tailwind CSS 4",
        "Prisma 7",
        "Neon Postgres",
        "Better Auth",
        "Zod 4",
        "Vitest",
        "Testing Library",
        "GitHub Actions",
        "Vercel",
      ].map((name) => [name, techFor(name)?.key]),
    )
    expect(keys).toEqual({
      "Next.js 16": "nextjs",
      "React 19": "react",
      TypeScript: "typescript",
      "Tailwind CSS 4": "tailwindcss",
      "Prisma 7": "prisma",
      "Neon Postgres": "neon",
      "Better Auth": "better-auth",
      "Zod 4": "zod",
      Vitest: "vitest",
      "Testing Library": "testing-library",
      "GitHub Actions": "github-actions",
      Vercel: "vercel",
    })
  })

  it("knows each technology by its own name too", () => {
    for (const tech of TECH) expect(techFor(tech.name)).toBe(tech)
  })

  it("guesses nothing: a name it was not given has no technology, however close", () => {
    for (const name of ["Cobol", "next.js 16", "Next.js 15", "Next", " Vercel", "constructor", "toString", ""]) {
      expect(techFor(name)).toBeUndefined()
    }
  })

  it("lists each technology once, its mark at /tech/<key>.svg", () => {
    expect(new Set(TECH.map((t) => t.key)).size).toBe(TECH.length)
    for (const { key, icon } of TECH) expect(icon).toBe(`/tech/${key}.svg`)
  })

  it("records where every mark came from and where the brand documents it", () => {
    for (const { source, documentedAt } of TECH) {
      expect(new URL(source).protocol).toBe("https:")
      expect(new URL(documentedAt).protocol).toBe("https:")
    }
  })

  it("marks the two Simple Icons stand-ins as unofficial, and only them", () => {
    const fallbacks = TECH.filter((t) => !t.official)
    expect(fallbacks.map((t) => t.key)).toEqual(["testing-library", "github-actions"])
    for (const { source } of fallbacks) expect(source).toMatch(/^https:\/\/raw\.githubusercontent\.com\/simple-icons\//)
  })
})

describe("the technology marks under public/tech", () => {
  it.each(TECH)("ships $icon for $name", ({ icon }) => {
    expect(existsSync(`public${icon}`)).toBe(true)
  })

  it("ships no mark the registry does not list", () => {
    expect([...marks].sort()).toEqual(TECH.map((t) => `${t.key}.svg`).sort())
  })

  // The same origin rule as the logos: a mark opened directly must not run anything or reach outside itself.
  it.each(marks)("ships %s with nothing that runs or reaches out", (name) => {
    expect(read(name)).toMatch(/<svg[^>]*\sviewBox="[^"]+"/)
    expect(svgHazards(read(name))).toEqual([])
  })

  // Simple Icons ship their path with no fill, which paints black: invisible on the dark ground. Only these two are
  // touched, and only to give the root their brand's own color; the official files are kept exactly as published.
  it.each([
    ["testing-library.svg", "#E33332"],
    ["github-actions.svg", "#2088FF"],
  ])("fills the stand-in %s in its brand color, so it reads on the dark ground", (name, color) => {
    expect(read(name)).toMatch(new RegExp(`^<svg[^>]*\\sfill="${color}"`))
  })
})
