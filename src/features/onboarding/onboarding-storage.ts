const KEY = "my-life:onboarding:v1"

export function readSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function markSeen(): void {
  try {
    window.localStorage.setItem(KEY, "1")
  } catch {
    // Storage can be blocked; the visitor simply sees the onboarding again next time.
  }
}
