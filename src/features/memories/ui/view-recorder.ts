import type { RecordViewResult } from "../views/view-result"

/**
 * Tells the server which memories the visitor opened, at most once per memory for as long as it lives (one page session).
 * The server still counts distinct visitors, so a repeat open later only bumps its own open count; this only keeps
 * rapid stepping and re-renders from spamming it.
 */
export interface SessionViewRecorder {
  /**
   * Records an open of this memory the first time it is asked, and answers true when that made the visitor a new viewer
   * (the shown count goes up by one). Every later ask, and every refusal or failure, answers false. Never throws.
   */
  record: (id: string) => Promise<boolean>
}

export function createViewRecorder(record: (id: string) => Promise<RecordViewResult>): SessionViewRecorder {
  // Asked, not answered: a second ask while the first is on its way must not go out too, and a failure is not retried.
  const asked = new Set<string>()
  return {
    async record(id) {
      if (asked.has(id)) return false
      asked.add(id)
      try {
        const result = await record(id)
        return result.ok && result.counted
      } catch {
        return false
      }
    },
  }
}
