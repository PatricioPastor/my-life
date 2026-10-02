"use client"

import { useState } from "react"
import {
  createMemory,
  listMemories,
  prepareUpload,
  recordMemoryView,
  resolveMapsLink,
  shareMemory,
  suggestPlace,
} from "../actions"
import type { MemoryView } from "../memory-view"
import { AddMemory } from "./add-memory"
import { uploadToCloudinary } from "./cloudinary-upload"
import { MemoriesPlace, type MemoriesState } from "./memories-place"
import { relatedFrom, type RelatedMemory } from "./related-memory"
import { useMemories } from "./use-memories"

interface MemoriesSpaceProps {
  accent?: string
}

/** The contribution form: closed, open on its own (the pill in the top bar), or open from a memory (its own Contribuir). */
interface ContributeState {
  open: boolean
  /** Kept while the form closes, so its chip does not vanish mid-fade; replaced the next time it opens. */
  related: RelatedMemory | null
}

/**
 * Container: loads the visitor memories from the server when the space mounts, hands them to the place and
 * offers "Contribuir", from the top bar and from the glass of a memory (which starts from that memory). A memory saved
 * here is appended to the end of the list, so the orbs already on the stage stay exactly where they are.
 */
export function MemoriesSpace({ accent }: MemoriesSpaceProps) {
  const loaded = useMemories(listMemories)
  const [added, setAdded] = useState<readonly MemoryView[]>([])
  const [contribute, setContribute] = useState<ContributeState>({ open: false, related: null })
  const state: MemoriesState =
    loaded.status === "ready" && added.length > 0 ? { status: "ready", memories: [...loaded.memories, ...added] } : loaded

  return (
    <MemoriesPlace
      state={state}
      accent={accent}
      share={(id) => shareMemory({ id })}
      onView={(id) => recordMemoryView({ id })}
      onContribute={(memory) => setContribute({ open: true, related: relatedFrom(memory) })}
      action={
        state.status === "ready"
          ? (container) => (
              <AddMemory
                container={container}
                prepare={prepareUpload}
                create={createMemory}
                upload={uploadToCloudinary}
                suggest={suggestPlace}
                resolveLink={resolveMapsLink}
                onCreated={(memory) => setAdded((list) => [...list, memory])}
                open={contribute.open}
                related={contribute.related}
                // Opened by its own control (never from a memory) it starts from nothing; closing keeps the chip until then.
                onOpenChange={(next) => setContribute((now) => (next ? { open: true, related: null } : { ...now, open: false }))}
              />
            )
          : undefined
      }
    />
  )
}
