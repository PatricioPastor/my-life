"use client"

import type { ReactNode } from "react"
import { listMemories } from "../actions"
import { MemoriesPlace } from "./memories-place"
import { useMemories } from "./use-memories"

interface MemoriesSpaceProps {
  accent?: string
  palette?: readonly string[]
  /** T5's "Agregar recuerdo" control. */
  action?: ReactNode
}

/** Container: loads the visitor's memories from the server when the space mounts and hands them to the place. */
export function MemoriesSpace({ accent, palette, action }: MemoriesSpaceProps) {
  const state = useMemories(listMemories)
  return <MemoriesPlace state={state} accent={accent} palette={palette} action={action} />
}
