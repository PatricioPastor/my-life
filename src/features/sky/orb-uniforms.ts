/** The memory orb as the sky paints it: CSS px from the top-left, y down. */
export interface SkyOrb {
  x: number
  y: number
  radius: number
  /** 0 hidden, 1 fully lit. */
  energy: number
  /** sRGB, 0..1. */
  color: readonly [number, number, number]
  /** How far apart the red and blue falloffs sit, as a share of the radius. */
  fringe: number
  /** 0 floating as a glow, 1 fully grown into the window onto the memories dimension. */
  peek: number
  /** The lens sphere's radius in CSS px (the soft glow's own size while the peek is 0). */
  lens: number
}

export interface OrbUniforms {
  /** x, y (y up), glow radius, energy. All zero hides the orb. */
  orb: [number, number, number, number]
  color: [number, number, number]
  fringe: number
  /** peek, lens radius, shield radius, shield amount. */
  lens: [number, number, number, number]
}

/** How far past the lens the sky's cursor light is held back, as a multiple of the lens radius. */
export const SHIELD_REACH = 2.6

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/**
 * What the shader is told about the orb. Besides painting the lens, a peeking orb shields its surroundings
 * from the sky's cursor light: the pointer sits on the orb while it is captured, and that warm lamp would
 * otherwise brighten the ember gas right behind it and dull its cool preview. The shield grows with the
 * peek and fades with the orb's own energy, and it never exists while the orb only floats.
 */
export function orbUniforms(glow: SkyOrb | null, cssH: number): OrbUniforms {
  if (!glow) return { orb: [0, 0, 0, 0], color: [0, 0, 0], fringe: 0, lens: [0, 0, 0, 0] }
  const peek = clamp01(glow.peek)
  const lens = Math.max(glow.lens, 0)
  return {
    orb: [glow.x, cssH - glow.y, glow.radius, glow.energy],
    color: [glow.color[0], glow.color[1], glow.color[2]],
    fringe: glow.fringe,
    lens: [peek, lens, lens * SHIELD_REACH, peek * clamp01(glow.energy)],
  }
}
