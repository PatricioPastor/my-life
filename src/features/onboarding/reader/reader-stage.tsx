"use client"

import { useMemo, useRef, type CSSProperties } from "react"
import type { Block } from "@/shared/content"
import { ReaderBlock } from "./reader-block"
import type { ReaderState } from "./reader-machine"
import { FOCUS_SCALE, useStackMotion } from "./use-stack-motion"

interface ReaderStageProps {
  blocks: readonly Block[]
  /** Block index of each readable paragraph (paragraph N of the reader is `readables[N]`). */
  readables: readonly number[]
  state: ReaderState
  reduced: boolean
}

/**
 * The stack of blocks. Every block is laid out small and scaled up when it takes the focus, so the line breaks never move;
 * `useStackMotion` slides the stack on a spring so the focused block lands on the reading line.
 */
export function ReaderStage({ blocks, readables, state, reduced }: ReaderStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLElement | null)[]>([])

  // Readable index of every block, -1 for the ones that are never read.
  const readable = useMemo(() => blocks.map((_, i) => readables.indexOf(i)), [blocks, readables])
  // Stable ref callbacks, so the memoised blocks are not re-rendered (and their refs not re-attached) by every word painted.
  const setters = useMemo(
    () =>
      blocks.map((_, i) => (el: HTMLElement | null) => {
        els.current[i] = el
      }),
    [blocks],
  )
  useStackMotion({ stage: stageRef, stack: stackRef, blocks: els, readable, target: state.activeIndex, reduced })

  const scale = reduced ? 1 : FOCUS_SCALE
  return (
    <div ref={stageRef} className="rd-stage" data-reduced={reduced} style={{ "--rd-s": scale } as CSSProperties}>
      <div ref={stackRef} className="rd-stack">
        {blocks.map((block, i) => {
          const r = readable[i]!
          return (
            <ReaderBlock
              key={i}
              block={block}
              painted={r >= 0 ? state.painted[r]! : 0}
              fill={reduced}
              active={r === state.activeIndex}
              blockRef={setters[i]!}
            />
          )
        })}
      </div>
    </div>
  )
}
