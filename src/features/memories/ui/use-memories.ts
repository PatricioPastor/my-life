"use client"

import { useEffect, useState } from "react"
import type { ListMemoriesResult } from "../memory-view"
import type { MemoriesState } from "./memories-place"

/** Calls `load` once when the place mounts and reports its progress as a state the place can show. */
export function useMemories(load: () => Promise<ListMemoriesResult>): MemoriesState {
  const [state, setState] = useState<MemoriesState>({ status: "loading" })
  useEffect(() => {
    let cancelled = false
    load().then(
      (result) => {
        if (cancelled) return
        setState(result.ok ? { status: "ready", memories: result.memories } : { status: "error", reason: result.reason })
      },
      () => {
        if (!cancelled) setState({ status: "error", reason: "unavailable" })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load])
  return state
}
