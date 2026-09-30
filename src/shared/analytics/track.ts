import { sendGAEvent } from "@next/third-parties/google"
import { track as vercelTrack } from "@vercel/analytics"
import { type EventName, type EventProps, sanitizeProps } from "./events"

type TrackArgs<N extends EventName> = keyof EventProps[N] extends never ? [] : [props: EventProps[N]]

/** Fire-and-forget: a no-op on the server, and a blocked or failing provider never surfaces. */
export function track<N extends EventName>(name: N, ...args: TrackArgs<N>): void {
  if (typeof window === "undefined") return
  const props = sanitizeProps(name, args[0] as Record<string, unknown> | undefined)
  try {
    vercelTrack(name, props)
  } catch {
    // Analytics must never break the journey.
  }
  if (!process.env.NEXT_PUBLIC_GA_ID) return
  try {
    sendGAEvent("event", name, props)
  } catch {
    // Same: best effort.
  }
}
