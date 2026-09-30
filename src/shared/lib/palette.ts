/** The landing's five exact colors, by role. Nothing else is ever blended into a star. */
export const PALETTE = {
  /** Shadow Grey: the background. */
  void: "#191923",
  /** Porcelain: text and the white-hot sparkle cores. */
  ink: "#FBFEF9",
  /** Soft Periwinkle: stars and gas of the older periwinkle sky. */
  periwinkle: "#8377D1",
  /** Sunflower Gold of the older periwinkle sky. */
  gold: "#F3B61F",
  /** School Bus Yellow: UI details only, never a star, gas or ring color. */
  signal: "#FFC600",
} as const

export type PaletteKey = keyof typeof PALETTE

/** Periwinkle gas ramp tints: Shadow Grey mixed toward Periwinkle at 18%, 35% and 60%. */
export const GAS_TINTS = {
  haze: "#2C2A42",
  dusk: "#3E3A60",
  wine: "#59518B",
} as const

/**
 * The warm portal palette, shared by the gate's tunnel and the sky.
 * Every value is exact and comes from here, nothing else is blended in.
 */
export const PORTAL = {
  /** Sunflower Gold, Sunlit Clay, Sandy Brown, Bronze Spice: the ring colors. */
  rings: ["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"],
  /** Coffee Bean: the lowest tone a ring is allowed to fade to on screen. */
  coffee: "#1F1300",
  /**
   * The background: Coffee Bean at a third of its brightness per channel
   * (1F 13 00 -> 0A 06 00), so it stays coffee-tinted but reads as near-black and depth shows.
   */
  deep: "#0A0600",
} as const

/**
 * The ember sky's gas ramp, from the portal palette only. Dusk is Coffee Bean mixed 30% toward
 * Bronze Spice (1F 13 00 -> CC 58 03 gives 53 28 01).
 */
export const EMBER_GAS = {
  haze: PORTAL.coffee,
  dusk: "#532801",
  wine: PORTAL.rings[3],
  crimson: PORTAL.rings[2],
  hot: PORTAL.rings[0],
} as const

/** Star colors in shader index order: the sparkle tint is the position in this list (the ring colors). */
export const STAR_COLORS = ["gold", "clay", "sandy", "bronze"] as const

export type StarColorKey = (typeof STAR_COLORS)[number]

export const STAR_TINT: Record<StarColorKey, number> = { gold: 0, clay: 1, sandy: 2, bronze: 3 }

export const STAR_HEX: Record<StarColorKey, string> = {
  gold: PORTAL.rings[0],
  clay: PORTAL.rings[1],
  sandy: PORTAL.rings[2],
  bronze: PORTAL.rings[3],
}
