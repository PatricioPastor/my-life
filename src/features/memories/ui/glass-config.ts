/**
 * The look of the glass sphere, as numbers and the math the shader runs on them, so its bounds can be tested.
 * Units: the sphere's radius is 1 (screen radius `r` from its center), and the photo's square crop spans -1..1.
 */
export const GLASS = {
  /** The canvas side over the sphere's diameter: room for the thin rim bloom, nothing more (the halo is CSS). */
  canvasScale: 1.08,
  lens: {
    /** Photo units per screen unit in the middle: a hair under 1, so the photo is barely magnified (about 1.06x). */
    center: 0.94,
    /** Inside this radius the photo is a straight scale; refraction only begins past it. */
    rimStart: 0.62,
    /** How sharply the rim gathers the photo (a power of the distance past `rimStart`). */
    power: 2.2,
    /** Where the rim looks in the photo: its edge, never past it (no smeared, clamped pixels). */
    edge: 1,
  },
  /** Relative radial offset of red and blue at the rim: a faint color fringe, nothing inside. */
  dispersion: 0.012,
  specular: {
    /** A soft, small highlight near the upper left rim (a window caught in the glass), away from the subject. */
    at: [-0.42, 0.5] as const,
    peak: 0.3,
    /** Its spread across the rim (radial) and along it (tangential), in sphere units. */
    radial: 0.05,
    tangential: 0.11,
    /** A faint, broad secondary across from it. */
    secondaryAt: [0.48, -0.56] as const,
    secondaryPeak: 0.08,
    secondarySize: 0.16,
  },
  /** The cool light the glass catches at grazing angles. */
  fresnel: 0.22,
  /** A thin shade inside the lower rim, for weight. */
  shade: 0.18,
  /** A thin glow just outside the rim, gone well before the canvas edge. */
  bloom: { width: 0.03, alpha: 0.18 },
} as const

const k = (GLASS.lens.edge - GLASS.lens.center) / (1 - GLASS.lens.rimStart) ** GLASS.lens.power

/** Where the glass looks in the photo (a radius in photo units) for a screen radius `r` in the sphere. */
export function lensRadius(r: number): number {
  const { center, rimStart, power } = GLASS.lens
  return center * r + k * Math.max(r - rimStart, 0) ** power
}

/** How much the photo is enlarged along the radius at `r`: above 1 is magnified, below 1 is gathered in. */
export function magnificationAt(r: number): number {
  const { center, rimStart, power } = GLASS.lens
  const slope = center + k * power * Math.max(r - rimStart, 0) ** (power - 1)
  return 1 / slope
}

/** The highlight's strength at a point of the sphere (y up), before it is laid over the photo. */
export function specularAt(x: number, y: number): number {
  const s = GLASS.specular
  const [cx, cy] = s.at
  const r = Math.hypot(cx, cy)
  const [ux, uy] = [cx / r, cy / r]
  const dx = x - cx
  const dy = y - cy
  const radial = dx * ux + dy * uy
  const tangential = -dx * uy + dy * ux
  const main = s.peak * Math.exp(-((radial / s.radial) ** 2 + (tangential / s.tangential) ** 2))
  const [ex, ey] = s.secondaryAt
  const second = s.secondaryPeak * Math.exp(-(((x - ex) ** 2 + (y - ey) ** 2) / s.secondarySize ** 2))
  return main + second
}

/** The brightest the highlight gets. */
export function specularPeak(): number {
  return specularAt(GLASS.specular.at[0], GLASS.specular.at[1])
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * The canvas alpha at screen radius `r` (the full glass): opaque inside, soft across the edge over `aa`, then a thin
 * bloom that reaches exactly zero at `1 + bloom.width`, well inside the canvas, so no edge of it is ever seen.
 */
export function outerAlpha(r: number, aa: number): number {
  const inside = 1 - smoothstep(1 - aa, 1 + aa, r)
  const bloom = r > 1 - aa ? GLASS.bloom.alpha * (1 - smoothstep(1, 1 + GLASS.bloom.width, r)) : 0
  return Math.max(inside, bloom)
}

/** A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time 0..1, solved exactly enough by bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const at = (a: number, b: number, t: number) => {
    const s = 1 - t
    return 3 * s * s * t * a + 3 * s * t * t * b + t * t * t
  }
  return (u) => {
    if (!(u > 0)) return 0
    if (u >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < u) lo = mid
      else hi = mid
    }
    return Math.min(Math.max(at(y1, y2, (lo + hi) / 2), 0), 1)
  }
}

/** The strong ease-out of the interface, `cubic-bezier(0.23, 1, 0.32, 1)`: the glass condenses and lets go on it. */
export const glassEase = cubicBezier(0.23, 1, 0.32, 1)
