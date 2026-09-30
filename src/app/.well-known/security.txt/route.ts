import { buildSecurityTxt } from "@/shared/site/security-txt"
import { resolveSiteUrl } from "@/shared/site/site-url"

// Cached, but regenerated daily so `Expires` (now + 364 days) never goes stale between deploys.
export const revalidate = 86400

export function GET() {
  const body = buildSecurityTxt({ siteUrl: resolveSiteUrl(process.env), now: new Date() })
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
