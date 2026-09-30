/** True when the query string asks for the full intro (`?intro` or `?intro=1`), whatever the remembered "seen" flag says. */
export function forcedIntro(search: string): boolean {
  const value = new URLSearchParams(search).get("intro")
  return value !== null && value !== "0" && value !== "false"
}
