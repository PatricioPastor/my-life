// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/features/work/work-experience", () => ({ WorkExperience: () => null }))

import { PROJECT } from "@/features/projects/project-fixture"

const load = vi.fn(() => [PROJECT])
vi.mock("@/features/projects/load-projects", () => ({ loadProjects: () => load() }))

import Page, { metadata } from "./page"

describe("/trabajo page", () => {
  it("renders the work galaxy with the case studies read on the server, and no deep link", () => {
    const element = Page() as unknown as { props: { projects: unknown; openProject?: string } }
    expect(element.props.projects).toEqual([PROJECT])
    expect(element.props.openProject).toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe("/trabajo metadata", () => {
  it("titles the page as the work, in Spanish, under the site's name", () => {
    expect(metadata.title).toBe("Trabajo · patriciopastor")
    expect(metadata.description).toBe("Proyectos de Patricio Pastor: qué construí, cómo y por qué.")
  })

  it("previews the link with the same title and description, not the invitation-only line of the home", () => {
    expect(metadata.openGraph).toMatchObject({
      title: "Trabajo · patriciopastor",
      description: metadata.description,
      type: "website",
      locale: "es_AR",
      siteName: "patriciopastor",
    })
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Trabajo · patriciopastor" })
    expect(JSON.stringify(metadata)).not.toContain("invitación")
  })

  it("is open to search engines, unlike the rest of the site, under its own canonical URL", () => {
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.alternates).toEqual({ canonical: "/trabajo" })
  })

  it("keeps the site's preview card: a page's own preview replaces the inherited one, image included", () => {
    const card = { url: "/opengraph-image", width: 1200, height: 630, alt: "patriciopastor", type: "image/png" }
    expect(metadata.openGraph?.images).toEqual([card])
    expect(metadata.twitter?.images).toEqual([card])
  })
})
