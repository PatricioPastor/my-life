export type SiteUrlEnv = Readonly<Record<string, string | undefined>>

const LOCAL_URL = "http://localhost:3000"

/** Canonical site origin: explicit setting, then Vercel's production host, then local dev. */
export function resolveSiteUrl(env: SiteUrlEnv): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelHost) return `https://${vercelHost}`
  return LOCAL_URL
}
