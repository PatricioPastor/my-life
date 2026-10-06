import type { Metadata } from "next"
import { loadProjects } from "@/features/projects/load-projects"
import { WORK_DESCRIPTION, WORK_PATH, WORK_TITLE, WorkExperience, workMetadata } from "@/features/work"

/**
 * The public galaxy: no onboarding, no gate, no memories, only Proyectos lit. The case studies are read and parsed on
 * the server, like on "/", and reach the client as plain props. Nothing here is per request, so the page is static.
 */
export const metadata: Metadata = workMetadata(WORK_TITLE, WORK_DESCRIPTION, WORK_PATH)

export default function WorkPage() {
  return <WorkExperience projects={loadProjects()} />
}
