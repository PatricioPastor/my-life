"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { MagneticCursor } from "@/features/cursor"
import { track } from "@/shared/analytics"
import type { MemoryView } from "../memory-view"
import { MemoriesPlace } from "./memories-place"

interface SharedMemoryProps {
  /** The one memory the link opens: approved, with its photo sizes, coarse place and orb color, and no handle. */
  memory: MemoryView
  /** The absolute link this page was opened from, so a guest can pass it on (they have no session to ask the server). */
  shareUrl: string
}

/**
 * Container of the guest view: the memories dimension (void and dust) with only the shared memory, open in the glass.
 * It needs no cookie. Every way out ("Universo", Esc, Cerrar, "Entrar al universo") goes to the start, which then runs
 * the onboarding and the gate. There is no camera, no constellation, no add button and no other memory.
 */
export function SharedMemory({ memory }: SharedMemoryProps) {
  const router = useRouter()
  const stage = useRef<HTMLElement>(null)

  // Once per visit, even when the effect runs twice (strict mode).
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    track("shared_memory_opened")
  }, [])

  return (
    <main ref={stage} className="fixed inset-0 overflow-hidden bg-void text-ink">
      <MemoriesPlace state={{ status: "ready", memories: [memory] }} guest={{ memoryId: memory.id, onExit: () => router.push("/") }} />
      <MagneticCursor stageRef={stage} />
    </main>
  )
}
