/** One soft glow drifting in the void. Positions and sizes are percentages of the stage; time is in seconds. */
export interface VoidGlow {
  /** The glow's color (violet or indigo). */
  color: string
  /** A faint tint taken from the orb palette, mixed into the glow's edge. */
  tint: string
  /** Where it rests, as a percentage of the stage. */
  x: number
  y: number
  /** Its diameter as a percentage of the stage width. */
  size: number
  /** Peak opacity of the glow's center. */
  alpha: number
  /** Seconds for one full drift there and back. */
  duration: number
  /** Negative, so each glow is already somewhere mid-cycle on arrival. */
  delay: number
  /** How far it travels, as a percentage of the stage. */
  travelX: number
  travelY: number
  /** How much of the camera's movement it follows (0 is fixed to the screen): the farthest layer of the void. */
  depth: number
}

/**
 * Three very soft glows that drift on long cycles of different lengths (71, 97 and 113 s) with different phases,
 * so the combined picture does not look like it repeats. Violet and indigo, each with a faint tint of an orb color.
 */
export const VOID_GLOWS: readonly VoidGlow[] = [
  { color: "#5b49c8", tint: "#8ab4ff", x: 34, y: 38, size: 70, alpha: 0.16, duration: 97, delay: -31, travelX: 16, travelY: 10, depth: 0.06 },
  { color: "#3a3fa8", tint: "#b79cff", x: 68, y: 58, size: 64, alpha: 0.14, duration: 113, delay: -74, travelX: -14, travelY: 14, depth: 0.1 },
  { color: "#6a3fb0", tint: "#7fe0d0", x: 52, y: 22, size: 52, alpha: 0.1, duration: 71, delay: -12, travelX: 10, travelY: -12, depth: 0.14 },
]
