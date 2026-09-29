import { HalftoneSky } from "@/features/sky"

// Temporary visual check for the sky; the journey replaces this.
export default function Home() {
  return (
    <main className="h-svh w-full overflow-hidden">
      <HalftoneSky />
    </main>
  )
}
