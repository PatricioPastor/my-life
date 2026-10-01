import {
  clampCamera,
  fitBounds,
  flightAt,
  flightDuration,
  inertiaStep,
  minZoomFor,
  panBy,
  panWithResistance,
  relaxCamera,
  settleAt,
  zoomAbout,
  type Bounds,
  type Camera,
  type Padding,
  type Point,
  type Viewport,
} from "./camera"
import {
  exceedsDrag,
  isDoubleTap,
  keyAction,
  pinchStep,
  sampleVelocity,
  wheelZoom,
  type PinchPair,
  type Tap,
} from "./gestures"

/** What the layers that follow the camera (edges, dust, glows) read. */
export interface CameraSource {
  camera: () => Camera
  /** The camera that fits the whole constellation: the depth layers measure their parallax from it. */
  home: () => Camera
  subscribe: (listener: () => void) => () => void
}

export interface FlightOptions {
  /** Called once, when the camera has landed (a flight that is replaced or cancelled never calls it). */
  onDone?: () => void
  /** `approach` is the slow-fast-settle flight to an orb; `quick` is a short move (a key, a double tap). */
  curve?: "approach" | "quick"
}

export interface CameraController extends CameraSource {
  viewport: () => Viewport
  setViewport: (viewport: Viewport) => void
  /** Sets the world rectangle and the content the home camera fits; `recenter` also moves the camera onto it. */
  setWorld: (bounds: Bounds, content: Bounds, recenter: boolean) => void
  setReduced: (reduced: boolean) => void
  /** Gestures and keys act only while enabled; flights always run. */
  setEnabled: (enabled: boolean) => void
  enabled: () => boolean
  /** Puts the camera somewhere at once. */
  jump: (camera: Camera) => void
  flyTo: (target: Camera, options?: FlightOptions) => void
  cancelFlight: () => void
  /** Under reduced motion a "flight" is a cut: this wraps the swap so the caller can fade around it. */
  setCut: (cut: (apply: () => void) => void) => void
  /** Advances flights, inertia and the soft edge by `dt` seconds. The frame loop calls it; it does nothing at rest. */
  step: (dt: number) => void
  /** Wires pointer, wheel and keyboard onto the stage. Returns the way to undo it. */
  attach: (stage: HTMLElement) => () => void
}

interface Options {
  reduced: boolean
  viewport: Viewport
  bounds: Bounds
  pad: Padding
  now?: () => number
}

const QUICK_FLIGHT_S = 0.3
/** How far past the edge a drag may pull the camera (screen px), before it stops following. */
const EDGE_SLACK_PX = 140
/** A flick only glides if the pointer was still moving this recently (ms) when it let go. */
const FLICK_WINDOW_MS = 90
const DOUBLE_TAP_ZOOM = 2
const OUTSIDE_VELOCITY_DECAY_PER_S = 12
/** Things that take their own pointers and keys: the HUD controls and any dialog. */
const OWN_INPUT = "[data-hud],[role='dialog'],[role='alertdialog']"

interface Flight {
  from: Camera
  to: Camera
  elapsed: number
  duration: number
  curve: "approach" | "quick"
  onDone?: () => void
}

interface Press {
  id: number
  start: Point
  last: Point
  lastAt: number
  dragging: boolean
}

export function createCameraController(options: Options): CameraController {
  const now = options.now ?? (() => performance.now())
  let reduced = options.reduced
  let viewport = options.viewport
  let bounds = options.bounds
  let content = options.bounds
  let minZoom = minZoomFor(bounds, viewport, options.pad)
  let home: Camera = fitBounds(content, viewport, options.pad, minZoom)
  let cam: Camera = home
  let velocity: Point = { x: 0, y: 0 }
  let flight: Flight | null = null
  let enabled = true
  let cut: (apply: () => void) => void = (apply) => apply()

  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  const slack = () => EDGE_SLACK_PX / cam.zoom
  const outside = () => cam.x < bounds.left || cam.x > bounds.right || cam.y < bounds.top || cam.y > bounds.bottom

  const recompute = () => {
    minZoom = minZoomFor(bounds, viewport, options.pad)
    home = fitBounds(content, viewport, options.pad, minZoom)
  }

  const set = (next: Camera) => {
    cam = next
    notify()
  }

  /** With no loop to ease it back (reduced motion), a camera that ended up past the edge is put back at once. */
  const settleNow = () => {
    if (reduced && outside()) set(clampCamera(cam, bounds))
  }

  const cancelFlight = () => {
    flight = null
  }

  const flyTo: CameraController["flyTo"] = (target, flyOptions = {}) => {
    cancelFlight()
    velocity = { x: 0, y: 0 }
    if (reduced) {
      cut(() => {
        set({ ...target })
        flyOptions.onDone?.()
      })
      return
    }
    const curve = flyOptions.curve ?? "approach"
    flight = {
      from: cam,
      to: target,
      elapsed: 0,
      duration: curve === "quick" ? QUICK_FLIGHT_S : flightDuration(cam, target),
      curve,
      onDone: flyOptions.onDone,
    }
  }

  /** A short move to `target` (a key press, a double tap), instant under reduced motion. */
  const move = (target: Camera) => {
    const clamped = clampCamera(target, bounds)
    if (reduced) {
      cancelFlight()
      set(clamped)
    } else flyTo(clamped, { curve: "quick" })
  }

  const step = (dt: number) => {
    if (flight) {
      flight.elapsed += dt
      const u = flight.elapsed / flight.duration
      const done = flight.onDone
      if (u >= 1) {
        const to = flight.to
        flight = null
        set({ ...to })
        done?.()
      } else {
        set(flight.curve === "quick" ? settleAt(flight.from, flight.to, u) : flightAt(flight.from, flight.to, u))
      }
      return
    }
    if (pressing() || reduced) return
    let changed = false
    if (velocity.x !== 0 || velocity.y !== 0) {
      cam = panWithResistance(cam, velocity.x * dt, velocity.y * dt, bounds, slack())
      velocity = inertiaStep(velocity, dt)
      if (outside()) {
        const k = Math.exp(-OUTSIDE_VELOCITY_DECAY_PER_S * dt)
        velocity = { x: velocity.x * k, y: velocity.y * k }
      }
      changed = true
    }
    const relaxed = relaxCamera(cam, bounds, dt)
    if (relaxed !== cam) {
      cam = relaxed
      changed = true
    }
    if (changed) notify()
  }

  // ---- gestures ---------------------------------------------------------------------------------------------

  const pointers = new Map<number, Point>()
  let press: Press | null = null
  let pinching = false
  let pinchPrev: PinchPair | null = null
  let lastTap: Tap | null = null
  let suppressClick = false
  const pressing = () => press?.dragging === true || pinching

  const pair = (): PinchPair | null => {
    const [a, b] = [...pointers.values()]
    return a && b ? { a, b } : null
  }

  const attach: CameraController["attach"] = (stage) => {
    const local = (event: { clientX: number; clientY: number }): Point => {
      const rect = stage.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const ignored = (target: EventTarget | null) => !enabled || (target instanceof Element && target.closest(OWN_INPUT) !== null)

    const zoomTo = (point: Point) => {
      const base = flight?.to ?? cam
      move(zoomAbout(base, viewport, point, DOUBLE_TAP_ZOOM, minZoom))
    }

    const onDown = (event: PointerEvent) => {
      if (ignored(event.target)) return
      if (event.pointerType === "mouse" && event.button !== 0) return
      pointers.set(event.pointerId, local(event))
      if (pointers.size === 1) {
        cancelFlight()
        velocity = { x: 0, y: 0 }
        const at = local(event)
        press = { id: event.pointerId, start: at, last: at, lastAt: now(), dragging: false }
      } else if (pointers.size === 2) {
        cancelFlight()
        pinching = true
        pinchPrev = pair()
        press = null
      }
    }

    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      const at = local(event)
      pointers.set(event.pointerId, at)
      if (pinching) {
        const next = pair()
        if (next && pinchPrev) {
          cam = pinchStep(cam, viewport, pinchPrev, next, minZoom)
          pinchPrev = next
          notify()
        }
        return
      }
      if (!press || press.id !== event.pointerId) return
      if (!press.dragging) {
        if (!exceedsDrag(at.x - press.start.x, at.y - press.start.y)) return
        press.dragging = true
        stage.setPointerCapture?.(event.pointerId)
        stage.dataset.dragging = "true"
      }
      const t = now()
      const dx = at.x - press.last.x
      const dy = at.y - press.last.y
      velocity = sampleVelocity(velocity, dx, dy, (t - press.lastAt) / 1000)
      press.last = at
      press.lastAt = t
      cam = panWithResistance(cam, dx, dy, bounds, slack())
      notify()
    }

    const onUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      if (pinching) {
        if (pointers.size < 2) {
          pinching = false
          pinchPrev = null
          velocity = { x: 0, y: 0 }
          // A finger left on the glass carries on as a drag, from where it is, with no jump.
          const [id, at] = [...pointers.entries()][0] ?? []
          press = id === undefined || !at ? null : { id, start: at, last: at, lastAt: now(), dragging: true }
          if (!press) {
            delete stage.dataset.dragging
            settleNow()
          }
        } else pinchPrev = pair()
        return
      }
      if (!press || press.id !== event.pointerId) return
      const was = press
      press = null
      stage.releasePointerCapture?.(event.pointerId)
      if (was.dragging) {
        delete stage.dataset.dragging
        if (reduced || now() - was.lastAt > FLICK_WINDOW_MS) velocity = { x: 0, y: 0 }
        suppressClick = true
        setTimeout(() => {
          suppressClick = false
        }, 0)
        settleNow()
        return
      }
      if (event.type !== "pointerup") return
      const onOrb = event.target instanceof Element && event.target.closest("[data-memory-id]") !== null
      if (onOrb) {
        lastTap = null
        return
      }
      const tap: Tap = { t: now(), ...local(event) }
      if (isDoubleTap(lastTap, tap)) {
        lastTap = null
        zoomTo(local(event))
      } else lastTap = tap
    }

    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onWheel = (event: WheelEvent) => {
      if (ignored(event.target)) return
      event.preventDefault()
      cancelFlight()
      velocity = { x: 0, y: 0 }
      cam = wheelZoom(cam, viewport, local(event), event, minZoom)
      notify()
      settleNow()
    }

    const onKey = (event: KeyboardEvent) => {
      if (ignored(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      const action = keyAction(event.key)
      if (!action) return
      event.preventDefault()
      const base = flight?.to ?? cam
      if (action.type === "pan") move(panBy(base, action.dx, action.dy))
      else if (action.type === "zoom") move(zoomAbout(base, viewport, { x: viewport.width / 2, y: viewport.height / 2 }, action.factor, minZoom))
      else flyTo(home)
    }

    stage.addEventListener("pointerdown", onDown)
    stage.addEventListener("pointermove", onMove)
    stage.addEventListener("pointerup", onUp)
    stage.addEventListener("pointercancel", onUp)
    stage.addEventListener("click", onClick, true)
    stage.addEventListener("wheel", onWheel, { passive: false })
    stage.addEventListener("keydown", onKey)
    return () => {
      stage.removeEventListener("pointerdown", onDown)
      stage.removeEventListener("pointermove", onMove)
      stage.removeEventListener("pointerup", onUp)
      stage.removeEventListener("pointercancel", onUp)
      stage.removeEventListener("click", onClick, true)
      stage.removeEventListener("wheel", onWheel)
      stage.removeEventListener("keydown", onKey)
      delete stage.dataset.dragging
      pointers.clear()
      press = null
      pinching = false
    }
  }

  return {
    camera: () => cam,
    home: () => home,
    viewport: () => viewport,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setViewport: (next) => {
      viewport = next
      recompute()
    },
    setWorld: (nextBounds, nextContent, recenter) => {
      bounds = nextBounds
      content = nextContent
      recompute()
      if (recenter) {
        velocity = { x: 0, y: 0 }
        cancelFlight()
        set(home)
      }
    },
    setReduced: (next) => {
      reduced = next
      if (reduced) {
        velocity = { x: 0, y: 0 }
        settleNow()
      }
    },
    setEnabled: (next) => {
      enabled = next
    },
    enabled: () => enabled,
    jump: (next) => {
      cancelFlight()
      velocity = { x: 0, y: 0 }
      set(next)
    },
    flyTo,
    cancelFlight,
    setCut: (next) => {
      cut = next
    },
    step,
    attach,
  }
}
