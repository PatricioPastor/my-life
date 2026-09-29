const clamp = (v: number) => Math.min(Math.max(v, 0.05), 0.95)

/** Where the lamp wanders when no hand is on the sky, in 0..1 stage space. */
export function driftPos(t: number): [number, number] {
  const x = 0.5 + 0.32 * Math.sin(t * 0.21) + 0.1 * Math.sin(t * 0.077 + 1.3)
  const y = 0.5 + 0.26 * Math.cos(t * 0.17) + 0.12 * Math.cos(t * 0.053 + 4.2)
  return [clamp(x), clamp(y)]
}
