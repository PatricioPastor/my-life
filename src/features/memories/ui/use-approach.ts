"use client"

import { useReducer, type RefObject } from "react"
import type { MemoryView } from "../memory-view"
import { IDLE, neighborOf, reduceApproach, type Approach } from "./approach"
import { focusCamera, type Point } from "./camera"
import type { CameraController } from "./camera-controller"
import { OPEN_ZOOM } from "./glass-layout"
import { GLASS_RELEASE_MS } from "./lens"
import type { PointsHandle } from "./memory-points"

export interface ApproachControls {
  state: Approach
  /** Fly the camera to an orb; the glass opens on arrival. */
  open: (id: string) => void
  /** Fly back to where the camera was (once the glass has melted back into the orb, if it was open). */
  close: () => void
  /** Fly to another memory (from the glass, or while still on the way). */
  step: (id: string) => void
  /** The memory before (-1) or after (1) the current one, in date order, or null. */
  neighbor: (direction: -1 | 1) => MemoryView | null
}

/**
 * Runs the approach: the pure state machine decides what phase it is in, and this hook flies the camera for each change.
 * The orb is pinned before the camera aims at it, and the camera aims so it lands on the sphere's center (`anchor`,
 * on the device pixel grid). While the camera is away from the overview the gestures are off (the glass takes the
 * pointer); they come back once it has flown home. A flight that is replaced never calls back, so a stale arrival
 * cannot open the wrong glass.
 */
export function useApproach(
  controller: CameraController,
  ordered: readonly MemoryView[],
  points: RefObject<PointsHandle | null>,
  anchor: () => Point,
): ApproachControls {
  const [state, dispatch] = useReducer(reduceApproach, IDLE)

  /** The camera that puts an orb on the sphere's center, with the orb pinned there first, or null. */
  const aimAt = (id: string) => {
    const world = points.current?.pin(id) ?? null
    return world ? focusCamera(world, controller.viewport(), OPEN_ZOOM, anchor()) : null
  }

  const flyToOrb = (id: string) => {
    const target = aimAt(id)
    if (!target) return
    controller.setEnabled(false)
    controller.flyTo(target, { onDone: () => dispatch({ type: "arrived" }) })
  }

  return {
    state,
    open: (id) => {
      if (state.phase !== "idle" && state.phase !== "leaving") return
      dispatch({ type: "activate", id, camera: controller.camera() })
      flyToOrb(id)
    },
    close: () => {
      if (state.phase !== "flying" && state.phase !== "open" && state.phase !== "switching") return
      const { back } = state
      const glassOpen = state.phase === "open" || state.phase === "switching"
      dispatch({ type: "close" })
      controller.flyTo(back, {
        // The glass melts back into the orb first; the camera leaves once it has.
        delay: glassOpen ? GLASS_RELEASE_MS / 1000 : 0,
        onDone: () => {
          controller.setEnabled(true)
          dispatch({ type: "left" })
        },
      })
    },
    step: (id) => {
      if (state.phase !== "flying" && state.phase !== "open" && state.phase !== "switching") return
      if (id === state.id) return
      dispatch({ type: "step", id })
      // From the open glass a new motion starts; on the way, the same motion bends toward the new memory.
      if (state.phase === "open") flyToOrb(id)
      else {
        const target = aimAt(id)
        if (target) controller.retarget(target)
      }
    },
    neighbor: (direction) => (state.phase === "idle" ? null : neighborOf(ordered, state.id, direction)),
  }
}
