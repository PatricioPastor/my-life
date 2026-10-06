// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { PROJECT } from "@/features/projects/project-fixture"

const OLDER = { ...PROJECT, meta: { ...PROJECT.meta, slug: "otra", updated: "2026-09-01", order: 2 } }
const load = vi.fn(() => [PROJECT, OLDER])
vi.mock("@/features/projects/load-projects", () => ({ loadProjects: () => load() }))

import sitemap from "./sitemap"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("sitemap", () => {
  it("lists the work galaxy and every case study, with absolute URLs on the site's origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://patriciopastor.dev/trabajo",
      "https://patriciopastor.dev/trabajo/consola",
      "https://patriciopastor.dev/trabajo/otra",
    ])
  })

  it("dates each case study by its own update, and the galaxy by the latest of them", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    expect(sitemap().map((e) => e.lastModified)).toEqual(["2026-10-06", "2026-10-06", "2026-09-01"])
  })

  it("lists nothing behind the gate or shared by link: only the work", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    for (const { url } of sitemap()) expect(new URL(url).pathname).toMatch(/^\/trabajo(\/[a-z0-9-]+)?$/)
  })

  it("still lists the galaxy, undated, when there is no case study", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    load.mockReturnValueOnce([])
    expect(sitemap()).toEqual([{ url: "https://patriciopastor.dev/trabajo" }])
  })
})
