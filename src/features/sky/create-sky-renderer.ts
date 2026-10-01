import { hexToRgb } from "@/shared/lib/color"
import { driftPos } from "./drift"
import { easeFocus, focusFx, stepFocusAmount } from "./focus"
import { orbUniforms, type SkyOrb } from "./orb-uniforms"
import { SKY_UNIFORM_SLOTS, SKY_VERTEX, buildSkyFragment, uniformName } from "./shaders"
import type { SkyParams } from "./sky-params"
import { layoutSkySparkles, pickTint, pushSparkle, type Sparkle, type SparkleAnchor } from "./sparkles"

export interface SkyRendererOptions {
  /** Read every frame, so param changes apply without restarting WebGL. */
  getParams: () => SkyParams
  /** Facet star positions; the bright sparkles hang on them. */
  getAnchors: () => readonly SparkleAnchor[]
  /** While true the loop keeps ticking but skips painting (the sky idles behind other screens). */
  isHidden: () => boolean
  /** Whether a click on open sky may hang a new sparkle. */
  canDropSparkle: () => boolean
  /** Parallax offset in CSS px (y already flipped to screen space), so labels ride with the sparkles. */
  onLayerShift: (x: number, y: number) => void
}

export type { SkyOrb } from "./orb-uniforms"

export interface SkyRenderer {
  /** Hang the orb in the sky, or take it down with null. Under reduced motion this repaints. */
  orb: (glow: SkyOrb | null) => void
  /** Move the lamp and send a shock ring through the gas. */
  pulse: (x: number, y: number) => void
  /** Move the lamp only. */
  aim: (x: number, y: number) => void
  /** Focus one anchor (its index in `getAnchors`): the gas dims and the star reveals itself. null releases. */
  focus: (index: number | null) => void
  stop: () => void
}

const MAX_SPARKS = 16
const MAX_RIPPLES = 4
const MAX_DPR = 1.5

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/**
 * The living sky: raw WebGL2, one fragment pass. Coordinates in and out are 0..1 with y up.
 * Returns null when WebGL2 or the shader is unavailable so the caller can show a fallback.
 */
export function createSkyRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  opts: SkyRendererOptions,
): SkyRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: "high-performance",
    })
  } catch {
    gl = null
  }
  if (!gl) return null
  const ctx = gl

  const compile = (type: number, text: string) => {
    const sh = ctx.createShader(type)
    if (!sh) return null
    ctx.shaderSource(sh, text)
    ctx.compileShader(sh)
    if (!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS)) {
      console.error("sky shader:", ctx.getShaderInfoLog(sh))
      ctx.deleteShader(sh)
      return null
    }
    return sh
  }
  const vs = compile(ctx.VERTEX_SHADER, SKY_VERTEX)
  const fs = compile(ctx.FRAGMENT_SHADER, buildSkyFragment(SKY_UNIFORM_SLOTS))
  const program = vs && fs ? ctx.createProgram() : null
  if (!vs || !fs || !program) {
    if (vs) ctx.deleteShader(vs)
    if (fs) ctx.deleteShader(fs)
    return null
  }
  ctx.attachShader(program, vs)
  ctx.attachShader(program, fs)
  ctx.linkProgram(program)
  ctx.deleteShader(vs)
  ctx.deleteShader(fs)
  if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
    console.error("sky program:", ctx.getProgramInfoLog(program))
    ctx.deleteProgram(program)
    return null
  }

  const loc = (n: string) => ctx.getUniformLocation(program, n)
  const tuned = SKY_UNIFORM_SLOTS.map(([key, kind]) => ({ at: loc(uniformName(key)), key, kind }))
  const U = {
    res: loc("uRes"), dpr: loc("uDpr"), time: loc("uTime"),
    pointer: loc("uPointer"), pointerOn: loc("uPointerOn"), look: loc("uLook"),
    sparkCount: loc("uSparkCount"), spark: loc("uSpark"), sparkB: loc("uSparkB"),
    ripple: loc("uRipple"), planet: loc("uPlanet"), starTints: loc("uStarTints"),
    anchorCount: loc("uAnchorCount"), focusIndex: loc("uFocusIndex"), focusAmount: loc("uFocusAmount"),
    focusTime: loc("uFocusTime"), focusMotion: loc("uFocusMotion"), focusFx: loc("uFocusFx"), focusArms: loc("uFocusArms"),
    orb: loc("uOrb"), orbColor: loc("uOrbColor"), orbFringe: loc("uOrbFringe"), orbLens: loc("uOrbLens"),
  }
  const vao = ctx.createVertexArray()

  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  let cssW = 1
  let cssH = 1
  let laidOut = opts.getParams().seed
  let sparks: Sparkle[] = layoutSkySparkles(laidOut, opts.getAnchors())
  const flare = new Float32Array(MAX_SPARKS)
  const sparkA = new Float32Array(MAX_SPARKS * 4)
  const sparkB = new Float32Array(MAX_SPARKS * 4)
  const ripples = new Float32Array(MAX_RIPPLES * 4)
  const tints = new Float32Array(12)
  let rippleNext = 0
  const t0 = performance.now()
  // Reduced motion freezes the clock on a well-developed frame.
  const clock = () => (reduced ? 14 : (performance.now() - t0) / 1000)
  let lastClock = 0
  let targetX = 0.5
  let targetY = 0.5
  let lampX = 0.5
  let lampY = 0.5
  let lookX = 0
  let lookY = 0
  let lampOn = 0
  let inside = false
  let lastTouched = -1e9
  // Focus: `focusIndex` is the star shown (kept while it fades out); `focusAmount` ramps 0..1 linearly.
  let focusWant = 0
  let focusIndex = -1
  let focusAmount = 0
  let focusStart = 0
  let orbGlow: SkyOrb | null = null
  let raf = 0
  let visible = true
  let alive = true

  const toUv = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [
      clamp01((e.clientX - r.left) / Math.max(r.width, 1)),
      clamp01(1 - (e.clientY - r.top) / Math.max(r.height, 1)),
    ]
  }
  const touch = (x: number, y: number) => {
    targetX = x
    targetY = y
    inside = true
    lastTouched = performance.now() / 1000
  }
  const ripple = (x: number, y: number, now: number) => {
    ripples.set([x * cssW, y * cssH, now, reduced ? 0 : 1], rippleNext * 4)
    rippleNext = (rippleNext + 1) % MAX_RIPPLES
    if (reduced) paint()
  }
  const onMove = (e: PointerEvent) => {
    const [x, y] = toUv(e)
    touch(x, y)
  }
  const onLeave = () => {
    inside = false
  }
  // A click on open sky hangs a new sparkle and sends a shock ring through the gas.
  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return
    if (opts.isHidden() || !opts.canDropSparkle()) return
    const target = e.target as Element | null
    if (target?.closest?.("a,button,input,textarea,select,label")) return
    const [x, y] = toUv(e)
    touch(x, y)
    const now = clock()
    const rand = Math.random()
    sparks = pushSparkle(
      sparks,
      {
        x, y, reach: 0.045 + 0.08 * rand, core: 0.006 + 0.008 * rand,
        tint: pickTint(Math.random()), phase: Math.random() * 6.283,
        born: reduced ? now - 10 : now, user: true,
      },
      MAX_SPARKS,
    )
    ripple(x, y, now)
  }
  const onLost = (e: Event) => {
    e.preventDefault()
    cancelAnimationFrame(raf)
    raf = 0
  }

  function paint() {
    if (!alive) return
    const p = opts.getParams()
    if (p.seed !== laidOut) {
      sparks = layoutSkySparkles(p.seed, opts.getAnchors())
        .concat(sparks.filter((s) => s.user))
        .slice(0, MAX_SPARKS)
      laidOut = p.seed
    }
    const t = clock()
    const dt = Math.min(Math.max(t - lastClock, 0), 0.1)
    lastClock = t

    // With no hand on it, the lamp wanders so the sky never sits dead.
    const idle = !inside || performance.now() / 1000 - lastTouched > 6
    const g = driftPos(t * 0.6)
    const wantX = idle ? g[0] : targetX
    const wantY = idle ? g[1] : targetY
    const k = reduced ? 1 : 1 - Math.exp(-dt * (idle ? 1.5 : 7))
    lampX += (wantX - lampX) * k
    lampY += (wantY - lampY) * k
    lookX += ((wantX - 0.5) * 2 - lookX) * k
    lookY += ((wantY - 0.5) * 2 - lookY) * k
    const onTarget = reduced ? 0 : idle ? 0.55 : 1
    lampOn += (onTarget - lampOn) * (reduced ? 1 : 1 - Math.exp(-dt * 3))

    focusAmount = reduced ? focusWant : stepFocusAmount(focusAmount, focusWant, dt)
    if (focusAmount === 0 && focusWant === 0) focusIndex = -1
    const fxTime = Math.max(t - focusStart, 0)
    const fx = focusFx(fxTime, 17 + Math.max(focusIndex, 0) * 31)

    const minSide = Math.min(cssW, cssH)
    const n = Math.min(sparks.length, MAX_SPARKS)
    for (let i = 0; i < n; i++) {
      const s = sparks[i]
      const reach = s.reach * minSide
      const d = Math.hypot((s.x - lampX) * cssW, (s.y - lampY) * cssH)
      const want = reduced ? 0 : Math.exp(-(d * d) / Math.max(reach * reach * 0.6, 400))
      flare[i] += (want - flare[i]) * (reduced ? 1 : 1 - Math.exp(-dt * 6))
      sparkA.set([s.x * cssW, s.y * cssH, reach, s.born], i * 4)
      sparkB.set([s.tint, s.phase, flare[i], Math.max(s.core * minSide, 1.5)], i * 4)
    }

    // Labels ride the same parallax as the sparkles they name.
    opts.onLayerShift(
      Math.floor(lookX * p.parallax * 1.2 * 28),
      -Math.floor(lookY * p.parallax * 1.2 * 28),
    )

    ctx.useProgram(program)
    ctx.bindVertexArray(vao)
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
    ctx.viewport(0, 0, canvas.width, canvas.height)
    for (const { at, key, kind } of tuned) {
      if (!at) continue
      const v = p[key]
      if (kind === "c") ctx.uniform3fv(at, hexToRgb(String(v)))
      else ctx.uniform1f(at, Number(v))
    }
    p.starTints.forEach((hex, i) => tints.set(hexToRgb(hex), i * 3))
    ctx.uniform3fv(U.starTints, tints)
    ctx.uniform2f(U.res, canvas.width, canvas.height)
    ctx.uniform1f(U.dpr, canvas.width / cssW)
    ctx.uniform1f(U.time, t)
    ctx.uniform2f(U.pointer, lampX * cssW, lampY * cssH)
    ctx.uniform1f(U.pointerOn, lampOn)
    ctx.uniform2f(U.look, lookX, lookY)
    ctx.uniform1i(U.sparkCount, n)
    ctx.uniform1i(U.anchorCount, Math.min(opts.getAnchors().length, n))
    ctx.uniform1i(U.focusIndex, focusIndex)
    ctx.uniform1f(U.focusAmount, easeFocus(focusAmount))
    ctx.uniform1f(U.focusTime, fxTime)
    ctx.uniform1f(U.focusMotion, reduced ? 0 : 1)
    ctx.uniform4f(U.focusFx, fx.flicker, fx.swell, 0, 0)
    ctx.uniform4f(U.focusArms, fx.arms[0], fx.arms[1], fx.arms[2], fx.arms[3])
    const o = orbUniforms(orbGlow, cssH)
    ctx.uniform4f(U.orb, ...o.orb)
    ctx.uniform3f(U.orbColor, ...o.color)
    ctx.uniform1f(U.orbFringe, o.fringe)
    ctx.uniform4f(U.orbLens, ...o.lens)
    ctx.uniform4fv(U.spark, sparkA)
    ctx.uniform4fv(U.sparkB, sparkB)
    ctx.uniform4fv(U.ripple, ripples)
    ctx.uniform4f(U.planet, p.planetX * cssW, p.planetY * cssH, p.planetRadius * minSide, p.planet ? 1 : 0)
    ctx.drawArrays(ctx.TRIANGLES, 0, 3)
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    cssW = Math.max(canvas.clientWidth, 1)
    cssH = Math.max(canvas.clientHeight, 1)
    const w = Math.floor(cssW * dpr)
    const h = Math.floor(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (reduced) paint()
  }

  function frame() {
    raf = 0
    // Behind other screens the sky only idles; it wakes the moment it is shown.
    if (!opts.isHidden()) paint()
    if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame)
  }

  function wake() {
    if (alive && !reduced && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
  }

  stage.addEventListener("pointermove", onMove)
  stage.addEventListener("pointerdown", onDown)
  stage.addEventListener("pointerleave", onLeave)
  stage.addEventListener("pointercancel", onLeave)
  canvas.addEventListener("webglcontextlost", onLost)
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((en) => en.isIntersecting)
          wake()
        })
      : null
  io?.observe(stage)
  document.addEventListener("visibilitychange", wake)
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null
  ro?.observe(canvas)

  resize()
  paint()
  wake()

  return {
    orb: (glow) => {
      orbGlow = glow
      // Reduced motion has no loop, so the orb's slow drift repaints on demand.
      if (reduced) paint()
    },
    aim: (x, y) => touch(x, y),
    focus: (index) => {
      const next = index !== null && index >= 0 && index < opts.getAnchors().length ? index : null
      if (next === null) {
        focusWant = 0
      } else {
        // A new star restarts the reveal clock; the dim simply stays.
        if (next !== focusIndex || focusWant === 0) focusStart = clock()
        focusIndex = next
        focusWant = 1
      }
      // Reduced motion has no loop, so repaint on demand.
      if (reduced) paint()
    },
    pulse: (x, y) => {
      touch(x, y)
      ripple(x, y, clock())
    },
    stop: () => {
      alive = false
      cancelAnimationFrame(raf)
      raf = 0
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener("visibilitychange", wake)
      stage.removeEventListener("pointermove", onMove)
      stage.removeEventListener("pointerdown", onDown)
      stage.removeEventListener("pointerleave", onLeave)
      stage.removeEventListener("pointercancel", onLeave)
      canvas.removeEventListener("webglcontextlost", onLost)
      ctx.deleteVertexArray(vao)
      ctx.deleteProgram(program)
    },
  }
}
