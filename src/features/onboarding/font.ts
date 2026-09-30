// Gambarino is licensed under the Fontshare FFL: it may only be served through the Fontshare API,
// never committed or self-hosted, subset or converted.
export const GAMBARINO_CSS = "https://api.fontshare.com/v2/css?f[]=gambarino@400&display=swap"
const LINK_ID = "gambarino-css"
export const FONT_WAIT_MS = 800

/** Adds the Fontshare stylesheet to the head once (deduped by id); it never blocks rendering. */
export function ensureGambarinoStylesheet(): HTMLLinkElement {
  const existing = document.getElementById(LINK_ID)
  if (existing instanceof HTMLLinkElement) return existing
  const link = document.createElement("link")
  link.id = LINK_ID
  link.rel = "stylesheet"
  link.href = GAMBARINO_CSS
  document.head.appendChild(link)
  return link
}

/** Resolves when the stylesheet is in and the 400 face is loaded; rejects if the stylesheet fails. */
export function loadGambarino(): Promise<unknown> {
  const link = ensureGambarinoStylesheet()
  const sheet = link.sheet
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        link.addEventListener("load", () => resolve(), { once: true })
        link.addEventListener("error", () => reject(new Error("gambarino stylesheet failed")), { once: true })
      })
  // fonts.load resolves at once for a family that is not declared yet, so wait for the sheet first.
  return sheet.then(() => document.fonts?.load("400 1em Gambarino"))
}

/** Waits for `load`, but never longer than `ms`: after that the caller shows its text with the fallback face. */
export function fontReadyOrTimeout(load: () => Promise<unknown>, ms: number): Promise<"ready" | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms)
    const settle = (result: "ready" | "timeout") => {
      clearTimeout(timer)
      resolve(result)
    }
    let pending: Promise<unknown>
    try {
      pending = load()
    } catch {
      settle("timeout")
      return
    }
    pending.then(
      () => settle("ready"),
      () => settle("timeout"),
    )
  })
}
