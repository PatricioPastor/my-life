"use client"

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { MagneticCursor } from "@/features/cursor"
import { track } from "@/shared/analytics"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"
import { MemoriesPlace, type MemoriesState } from "./memories-place"

interface SharedMemoryProps {
  /** The one memory the link opens: approved, with its photo sizes, coarse place and orb color, and no handle. */
  memory: MemoryView
  /** The absolute link this page was opened from, so a guest can pass it on (they have no session to ask the server). */
  shareUrl: string
}

const subscribeNever = () => () => {}

/**
 * Container of the guest view: the memories dimension (void and dust) with only the shared memory, open in the glass.
 * It needs no cookie. Every way out ("Universo", Esc, Cerrar, "Entrar al universo") goes to the start, which then runs
 * the onboarding and the gate. There is no camera, no constellation, no add button and no other memory.
 */
export function SharedMemory({ memory, shareUrl }: SharedMemoryProps) {
  const router = useRouter()
  // The place measures the real viewport and flies the camera on mount, so it only mounts once the page is hydrated (the
  // server has no window, and a stale size would aim the camera at the wrong spot). Until then: the dark void.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  const stage = useRef<HTMLElement>(null)
  const state = useMemo<MemoriesState>(() => ({ status: "ready", memories: [memory] }), [memory])
  const reshare = useMemo(() => async (): Promise<ShareMemoryResult> => ({ ok: true, url: shareUrl }), [shareUrl])

  // Once per visit, even when the effect runs twice (strict mode).
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    track("shared_memory_opened")
  }, [])

  return (
    <main ref={stage} className="fixed inset-0 overflow-clip bg-void text-ink">
      {hydrated && (
        <MemoriesPlace
          state={state}
          guest={{ memoryId: memory.id, onExit: () => router.push("/") }}
          // A guest cannot ask the server (no session), but they hold the link: sharing it again is passing it on.
          share={reshare}
        />
      )}
      <MagneticCursor stageRef={stage} />
    </main>
  )
}
