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
import { useMemories } from "./use-memories"

interface MemoriesSpaceProps {
  accent?: string
}

/**
 * Container: loads the visitor memories from the server when the space mounts, hands them to the place and
 * offers "Agregar recuerdo". A memory saved here is appended to the end of the list, so the orbs already on
 * the stage stay exactly where they are.
 */
export function MemoriesSpace({ accent }: MemoriesSpaceProps) {
  const loaded = useMemories(listMemories)
  const [added, setAdded] = useState<readonly MemoryView[]>([])
  const state: MemoriesState =
    loaded.status === "ready" && added.length > 0 ? { status: "ready", memories: [...loaded.memories, ...added] } : loaded

  return (
    <MemoriesPlace
      state={state}
      accent={accent}
      share={(id) => shareMemory({ id })}
      onView={(id) => recordMemoryView({ id })}
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
              />
            )
          : undefined
      }
    />
  )
}
