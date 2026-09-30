export type SiteUrlEnv = Readonly<Record<string, string | undefined>>

const LOCAL_URL = "http://localhost:3000"

/** A bare host gets https://; anything that is not a valid http(s) URL yields null. */
function normalizeOrigin(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "")
  } catch {
    return null
  }
}

/** Canonical site origin: explicit setting, then Vercel's production host, then local dev. Always a valid URL. */
export function resolveSiteUrl(env: SiteUrlEnv): string {
  return normalizeOrigin(env.NEXT_PUBLIC_SITE_URL) ?? normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ?? LOCAL_URL
}
