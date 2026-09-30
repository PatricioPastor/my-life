"use client"

import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import type { Block } from "@/shared/content"
import {
  canContinue as canContinueOf,
  initReader,
  nextDueMs,
  readerProgress,
  readerStep,
  type ReaderEvent,
  type ReaderPlan,
  type ReaderState,
} from "./reader-machine"
import { readingTimeline, type ReadingTimeline } from "./timeline"

/** A finished paragraph rests this long before the next one springs into focus on its own. */
export const SETTLE_MS = 600

export interface UseReader {
  timeline: ReadingTimeline
  plan: ReaderPlan
  state: ReaderState
  /** 0-100, an integer. */
  progress: number
  canContinue: boolean
  next: () => void
  prev: () => void
  step: (direction: 1 | -1) => void
  /** Report how many reading areas tall each paragraph is (for panning a tall one). */
  measure: (ratios: readonly number[]) => void
}

const clock = () => performance.now()

/**
 * The reader machine wired to time. It sleeps until the next word, the end of the paragraph or the hand-over and ticks then:
 * state changes at word pace (a few times a second), never once per frame.
 */
export function useReader(blocks: readonly Block[], { startDelayMs = 0, now = clock }: { startDelayMs?: number; now?: () => number } = {}): UseReader {
  const timeline = useMemo(() => readingTimeline(blocks), [blocks])
  const plan = useMemo<ReaderPlan>(
    () => ({
      paragraphs: timeline.readables.map((b) => ({ wordStarts: timeline.entries[b]!.wordStarts, endMs: timeline.entries[b]!.endMs })),
      settleMs: SETTLE_MS,
    }),
    [timeline],
  )
  const [machine, dispatch] = useReducer(
    (s: ReaderState, e: ReaderEvent | { type: "reset"; plan: ReaderPlan }) => (e.type === "reset" ? initReader(e.plan) : readerStep(plan, s, e)),
    plan,
    initReader,
  )
  // A different story is a different plan: start over rather than reading the old state against the new paragraphs.
  // The key is the content, not the identity of the array: a rerender that rebuilds equal blocks keeps the reader where it was.
  const signature = useMemo(() => JSON.stringify(blocks), [blocks])
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) {
    setSeen(signature)
    dispatch({ type: "reset", plan })
  }
  const state = seen === signature ? machine : initReader(plan)

  // Reading starts once the story has settled on screen.
  const [started, setStarted] = useState(startDelayMs <= 0)
  useEffect(() => {
    if (started) return
    const id = setTimeout(() => setStarted(true), startDelayMs)
    return () => clearTimeout(id)
  }, [started, startDelayMs])

  useEffect(() => {
    if (!started) return
    const due = nextDueMs(plan, state)
    if (due === null) return
    const id = setTimeout(() => dispatch({ type: "tick", now: now() }), due)
    return () => clearTimeout(id)
  }, [plan, state, started, now])

  const next = useCallback(() => dispatch({ type: "next" }), [])
  const prev = useCallback(() => dispatch({ type: "prev" }), [])
  const measure = useCallback((ratios: readonly number[]) => dispatch({ type: "measure", ratios }), [])
  const step = useCallback((direction: 1 | -1) => dispatch({ type: direction === 1 ? "next" : "prev" }), [])

  return { timeline, plan, state, progress: readerProgress(plan, state), canContinue: canContinueOf(plan, state), next, prev, step, measure }
}
