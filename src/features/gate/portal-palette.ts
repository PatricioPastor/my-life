/**
 * The portal's own palette. The sky keeps periwinkle; the tunnel is warm.
 * Every value is exact and comes from here, nothing else is blended in.
 */
export const PORTAL = {
  /** Sunflower Gold, Sunlit Clay, Sandy Brown, Bronze Spice: the ring colors. */
  rings: ["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"],
  /** Coffee Bean: the lowest tone a ring is allowed to fade to on screen. */
  coffee: "#1F1300",
  /**
   * The tunnel's background: Coffee Bean at a third of its brightness per channel
   * (1F 13 00 -> 0A 06 00), so it stays coffee-tinted but reads as near-black and depth shows.
   */
  deep: "#0A0600",
} as const
