import { buildSecurityTxt } from "@/shared/site/security-txt"
import { resolveSiteUrl } from "@/shared/site/site-url"

export const dynamic = "force-static"

export function GET() {
  const body = buildSecurityTxt({ siteUrl: resolveSiteUrl(process.env), now: new Date() })
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
