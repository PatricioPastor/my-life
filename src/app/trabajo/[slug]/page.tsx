import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { Project } from "@/features/projects"
import { loadProjects } from "@/features/projects/load-projects"
import { WorkExperience, workMetadata, workProjectPath } from "@/features/work"

/**
 * A deep link to one case study: the work galaxy opened straight on it, with Back to the Proyectos list and the sky.
 * One page is built per case study; any other slug answers 404 without rendering (`dynamicParams`).
 */
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams(): { slug: string }[] {
  return loadProjects().map((p) => ({ slug: p.meta.slug }))
}

function projectFor(projects: readonly Project[], slug: string): Project {
  const project = projects.find((p) => p.meta.slug === slug)
  if (!project) notFound()
  return project
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { meta } = projectFor(loadProjects(), slug)
  return workMetadata(meta.title, meta.summary, workProjectPath(meta.slug))
}

export default async function WorkProjectPage({ params }: Props) {
  const { slug } = await params
  const projects = loadProjects()
  projectFor(projects, slug)
  return <WorkExperience projects={projects} openProject={slug} />
}
