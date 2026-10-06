// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/features/work/work-experience", () => ({ WorkExperience: () => null }))

class NotFound extends Error {
  constructor() {
    super("NEXT_HTTP_ERROR_FALLBACK;404")
  }
}
vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new NotFound()
  },
}))

import { PROJECT } from "@/features/projects/project-fixture"

const SECOND = {
  ...PROJECT,
  meta: { ...PROJECT.meta, slug: "otra", title: "Otra consola", summary: "Otra consola, para otro equipo.", order: 2 },
}
vi.mock("@/features/projects/load-projects", () => ({ loadProjects: () => [PROJECT, SECOND] }))

import Page, { dynamicParams, generateMetadata, generateStaticParams } from "./page"

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe("/trabajo/[slug] page", () => {
  it("builds one page per case study", () => {
    expect(generateStaticParams()).toEqual([{ slug: "consola" }, { slug: "otra" }])
  })

  it("answers 404 for any slug it did not build, without rendering it", () => {
    expect(dynamicParams).toBe(false)
  })

  it("renders the work galaxy opened straight on that case study", async () => {
    const element = (await Page(params("otra"))) as unknown as { props: { projects: unknown; openProject: string } }
    expect(element.props.openProject).toBe("otra")
    expect(element.props.projects).toEqual([PROJECT, SECOND])
  })

  it("is not found for a slug that is no case study", async () => {
    await expect(Page(params("nope"))).rejects.toBeInstanceOf(NotFound)
  })
})

describe("/trabajo/[slug] metadata", () => {
  it("titles the page with the case study and describes it with its summary", async () => {
    const meta = await generateMetadata(params("otra"))
    expect(meta.title).toBe("Otra consola · patriciopastor")
    expect(meta.description).toBe("Otra consola, para otro equipo.")
    expect(meta.openGraph).toMatchObject({ title: "Otra consola · patriciopastor", description: meta.description })
    expect(meta.twitter).toMatchObject({ title: "Otra consola · patriciopastor", description: meta.description })
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: "/opengraph-image" })])
  })

  it("says nothing about a case study that does not exist", async () => {
    await expect(generateMetadata(params("nope"))).rejects.toBeInstanceOf(NotFound)
  })
})
