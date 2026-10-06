import type { MetadataRoute } from "next"
import { loadProjects } from "@/features/projects/load-projects"
import { WORK_PATH, workProjectPath } from "@/features/work/paths"
import { resolveSiteUrl } from "@/shared/site/site-url"

/**
 * Only the public work is listed: the galaxy and each case study. Everything else stays out of search (the root
 * layout's noindex), so it has no business here. Built once, from the same Markdown the pages read.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = resolveSiteUrl(process.env)
  const projects = loadProjects()
  // ISO dates compare as strings: the galaxy changes whenever any of its case studies does.
  const latest = projects.map((p) => p.meta.updated).sort().at(-1)
  return [
    { url: `${site}${WORK_PATH}`, ...(latest ? { lastModified: latest } : {}) },
    ...projects.map((p) => ({ url: `${site}${workProjectPath(p.meta.slug)}`, lastModified: p.meta.updated })),
  ]
}
