"use client"

import dynamic from "next/dynamic"
import type { Project } from "@/features/projects"

// The same heavy client tree as the story (sky, cursor, shaders), in its own chunk and never rendered on the server.
const LazyJourney = dynamic(() => import("@/features/journey").then((m) => m.Journey), { ssr: false })

interface WorkExperienceProps {
  /** The case studies behind Proyectos, loaded on the server. */
  projects: readonly Project[]
  /** The slug of a case study to open straight away (/trabajo/[slug]). */
  openProject?: string
}

/** The public galaxy at /trabajo: the journey in its work mode, with no onboarding over it and no gate. */
export function WorkExperience({ projects, openProject }: WorkExperienceProps) {
  return <LazyJourney mode="work" projects={projects} openProject={openProject} />
}
