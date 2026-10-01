// The analytics vocabulary. Props are allow-listed per event so an Instagram handle
// or any free text can never be attached, even through a cast.
export const FACET_IDS = ["stories", "writing", "projects", "now"] as const
export type FacetId = (typeof FACET_IDS)[number]

const MAX_ENTRY_INDEX = 99

export interface EventProps {
  gate_submitted: Record<never, never>
  gate_granted: Record<never, never>
  gate_denied: Record<never, never>
  access_requested: Record<never, never>
  onboarding_completed: Record<never, never>
  onboarding_skipped: Record<never, never>
  hw_accel_suggested: Record<never, never>
  intro_replayed: Record<never, never>
  story_completed: Record<never, never>
  memory_orb_opened: Record<never, never>
  memory_submitted: Record<never, never>
  facet_opened: { facet: FacetId }
  entry_opened: { facet: FacetId; index: number }
}

export type EventName = keyof EventProps

type Accepts = (value: unknown) => boolean

const isFacet: Accepts = (v) => typeof v === "string" && (FACET_IDS as readonly string[]).includes(v)
const isIndex: Accepts = (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_ENTRY_INDEX

const ALLOWED: Record<EventName, Record<string, Accepts>> = {
  gate_submitted: {},
  gate_granted: {},
  gate_denied: {},
  access_requested: {},
  onboarding_completed: {},
  onboarding_skipped: {},
  hw_accel_suggested: {},
  intro_replayed: {},
  story_completed: {},
  memory_orb_opened: {},
  memory_submitted: {},
  facet_opened: { facet: isFacet },
  entry_opened: { facet: isFacet, index: isIndex },
}

/** Keeps only allow-listed keys whose values pass their check; everything else is dropped. */
export function sanitizeProps(name: EventName, props: Record<string, unknown> = {}): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, accepts] of Object.entries(ALLOWED[name])) {
    const value = props[key]
    if (accepts(value)) out[key] = value as string | number
  }
  return out
}
