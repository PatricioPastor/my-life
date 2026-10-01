/** Reads how long an audio lasts, in milliseconds, or null when it cannot be known (a seam for tests). */
export type ReadAudioDuration = (file: Blob) => Promise<number | null>

/**
 * Asks the browser how long a picked audio is, with a throwaway `Audio` element that only loads the metadata. Best
 * effort: a file the browser cannot decode, a recording without a duration header (it reports `Infinity`), no `Audio`
 * at all, or no answer within the timeout all give null, and the server checks the real duration anyway.
 */
export const readAudioDuration = (file: Blob, timeoutMs = 4000): Promise<number | null> =>
  new Promise((resolve) => {
    if (typeof Audio === "undefined") return resolve(null)
    const url = URL.createObjectURL(file)
    const probe = new Audio()
    const timer = setTimeout(() => done(null), timeoutMs)
    function done(value: number | null) {
      clearTimeout(timer)
      probe.removeAttribute?.("src")
      URL.revokeObjectURL(url)
      resolve(value)
    }
    probe.preload = "metadata"
    probe.addEventListener("loadedmetadata", () => {
      done(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration * 1000) : null)
    })
    probe.addEventListener("error", () => done(null))
    probe.src = url
    probe.load?.()
  })
