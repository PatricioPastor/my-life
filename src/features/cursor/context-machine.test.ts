import { describe, expect, it } from "vitest"
import { DWELL_MS, contextReducer, initialContextState, nextDeadline, type ContextEvent, type ContextState } from "./context-machine"

const star = (id: string) => ({ id, label: id.toUpperCase(), context: `about ${id}` })

const run = (events: ContextEvent[], from: ContextState = initialContextState) => events.reduce(contextReducer, from)

describe("contextReducer", () => {
  it("starts hidden", () => {
    expect(initialContextState.phase).toBe("hidden")
  })

  it("stays hidden until the dwell has passed, then shows the hint", () => {
    let s = run([{ type: "capture", target: star("a"), now: 1000 }])
    expect(s.phase).toBe("hidden")
    s = contextReducer(s, { type: "tick", now: 1000 + DWELL_MS - 1 })
    expect(s.phase).toBe("hidden")
    s = contextReducer(s, { type: "tick", now: 1000 + DWELL_MS })
    expect(s.phase).toBe("hint")
    expect(s.target?.id).toBe("a")
  })

  it("expands while Ctrl is held and returns to the hint on release", () => {
    let s = run([
      { type: "capture", target: star("a"), now: 0 },
      { type: "tick", now: DWELL_MS },
      { type: "ctrl", down: true, now: 900 },
    ])
    expect(s.phase).toBe("expanded")
    s = contextReducer(s, { type: "ctrl", down: false, now: 1200 })
    expect(s.phase).toBe("hint")
  })

  it("expands at once when Ctrl is already down or goes down before the dwell ends", () => {
    expect(run([{ type: "ctrl", down: true, now: 0 }, { type: "capture", target: star("a"), now: 10 }]).phase).toBe("expanded")
    expect(run([{ type: "capture", target: star("a"), now: 0 }, { type: "ctrl", down: true, now: 100 }]).phase).toBe("expanded")
  })

  it("hides when the star is released, even with Ctrl held, and the next star dwells again", () => {
    let s = run([
      { type: "capture", target: star("a"), now: 0 },
      { type: "tick", now: DWELL_MS },
      { type: "capture", target: null, now: 800 },
    ])
    expect(s.phase).toBe("hidden")
    expect(nextDeadline(s)).toBeNull()
    s = run([{ type: "capture", target: star("b"), now: 900 }], s)
    expect(s.phase).toBe("hidden")
    expect(nextDeadline(s)).toBe(900 + DWELL_MS)
  })

  it("keeps the panel visible when the captured star changes, retargeting its text", () => {
    const s = run([
      { type: "capture", target: star("a"), now: 0 },
      { type: "tick", now: DWELL_MS },
      { type: "capture", target: star("b"), now: 700 },
    ])
    expect(s.phase).toBe("hint")
    expect(s.target?.id).toBe("b")
    const held = run([{ type: "ctrl", down: true, now: 800 }, { type: "capture", target: star("c"), now: 900 }], s)
    expect(held.phase).toBe("expanded")
    expect(held.target?.id).toBe("c")
  })

  it("ignores targets without context", () => {
    const s = run([{ type: "capture", target: { id: "x", label: "Abrir", context: null }, now: 0 }])
    expect(s.phase).toBe("hidden")
    expect(nextDeadline(s)).toBeNull()
    expect(run([{ type: "ctrl", down: true, now: 5 }], s).phase).toBe("hidden")
  })

  it("does not restart the dwell for the same star", () => {
    const first = run([{ type: "capture", target: star("a"), now: 0 }])
    expect(contextReducer(first, { type: "capture", target: star("a"), now: 300 })).toBe(first)
  })

  it("drops Ctrl on window blur so a lost keyup cannot leave it expanded", () => {
    let s = run([
      { type: "capture", target: star("a"), now: 0 },
      { type: "ctrl", down: true, now: 10 },
    ])
    expect(s.phase).toBe("expanded")
    s = contextReducer(s, { type: "blur", now: 20 })
    expect(s.phase).toBe("hint")
    expect(s.ctrl).toBe(false)
  })

  it("a tick after the star was released does nothing", () => {
    const s = run([
      { type: "capture", target: star("a"), now: 0 },
      { type: "capture", target: null, now: 100 },
      { type: "tick", now: 5000 },
    ])
    expect(s.phase).toBe("hidden")
  })
})

describe("nextDeadline", () => {
  it("is the moment the dwell completes, and null once shown", () => {
    const s = run([{ type: "capture", target: star("a"), now: 250 }])
    expect(nextDeadline(s)).toBe(250 + DWELL_MS)
    expect(nextDeadline(contextReducer(s, { type: "tick", now: 250 + DWELL_MS }))).toBeNull()
  })
})
