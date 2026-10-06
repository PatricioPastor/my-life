import { Experience } from "@/features/onboarding"
import { loadProjects } from "@/features/projects/load-projects"
import { loadStory } from "@/shared/content/load-story"

// The story and the case studies are read and parsed on the server: at build time, and again when a Server Action
// re-renders "/" (the files ship with the function through next.config.ts). A malformed file fails the build with the
// parser's message. Both reach the client as plain props.
const INTRO_STORY = "content/intro/por-que-cree-esto.md"

export default function Home() {
  const story = loadStory(INTRO_STORY)
  const projects = loadProjects()
  return <Experience story={story} projects={projects} />
}
