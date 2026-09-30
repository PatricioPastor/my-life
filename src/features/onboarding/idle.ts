/** Runs `task` when the main thread is idle (setTimeout where requestIdleCallback is missing). Returns a cancel. */
export function whenIdle(task: () => void, timeout = 1500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(task, 200)
  return () => clearTimeout(id)
}
