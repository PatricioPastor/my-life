import type { ShareMemoryResult } from "../share/share-view"

/**
 * The share links asked for so far, per memory. A link is asked for ahead of the click, so the click can open the system
 * share sheet at once: iOS Safari only allows it inside the user gesture, and a server round trip would end the gesture.
 * Only a link that arrived is kept; a failure is forgotten, so the next ask tries again.
 */
export interface ShareCache {
  /** Starts asking for the link of a memory, once: later calls (and renders) do nothing. */
  prefetch: (id: string) => void
  /** The link, when it has arrived. */
  peek: (id: string) => ShareMemoryResult | undefined
  /** The link: the one on its way or in hand, or a new ask. */
  get: (id: string) => Promise<ShareMemoryResult>
}

export function createShareCache(share: (id: string) => Promise<ShareMemoryResult>): ShareCache {
  const asked = new Map<string, Promise<ShareMemoryResult>>()
  const arrived = new Map<string, ShareMemoryResult>()

  const get = (id: string) => {
    const known = asked.get(id)
    if (known) return known
    const ask = share(id).then(
      (result): ShareMemoryResult => result,
      (): ShareMemoryResult => ({ ok: false, reason: "unavailable" }),
    )
    asked.set(id, ask)
    void ask.then((result) => {
      if (result.ok) arrived.set(id, result)
      else if (asked.get(id) === ask) asked.delete(id)
    })
    return ask
  }

  return { prefetch: (id) => void get(id), peek: (id) => arrived.get(id), get }
}
