/** The landing's five exact colors, by role. Nothing else is ever blended into a star. */
export const PALETTE = {
  /** Shadow Grey: the background. */
  void: "#191923",
  /** Porcelain: text and stars. */
  ink: "#FBFEF9",
  /** Soft Periwinkle: stars and gas. */
  periwinkle: "#8377D1",
  /** Sunflower Gold: stars and the gas peak. */
  gold: "#F3B61F",
  /** School Bus Yellow: UI details only, never a star, gas or ring color. */
  signal: "#FFC600",
} as const

export type PaletteKey = keyof typeof PALETTE

/** Gas ramp tints: Shadow Grey mixed toward Periwinkle at 18%, 35% and 60%. */
export const GAS_TINTS = {
  haze: "#2C2A42",
  dusk: "#3E3A60",
  wine: "#59518B",
} as const

/** Star colors in shader index order: the sparkle tint is the position in this list. */
export const STAR_COLORS = ["gold", "ink", "periwinkle"] as const

export type StarColorKey = (typeof STAR_COLORS)[number]

export const STAR_TINT: Record<StarColorKey, number> = { gold: 0, ink: 1, periwinkle: 2 }
