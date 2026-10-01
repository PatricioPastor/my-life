import { Experience } from "@/features/onboarding"
import { loadStory } from "@/shared/content/load-story"

// The story is read and parsed on the server: at build time, and again when a Server Action re-renders "/" (the file
// ships with the function through next.config.ts). A malformed file fails the build with the parser's message.
const INTRO_STORY = "content/intro/por-que-cree-esto.md"

export default function Home() {
  const story = loadStory(INTRO_STORY)
  return <Experience story={story} />
}
