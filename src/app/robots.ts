import type { MetadataRoute } from "next"
import { resolveSiteUrl } from "@/shared/site/site-url"

/**
 * Crawlers may fetch everything and are pointed at the sitemap (the public work). Nothing is disallowed on purpose:
 * the pages kept out of search carry their own noindex, and a crawler has to reach a page to read it. A disallowed URL
 * can still be indexed, bare, from links elsewhere.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${resolveSiteUrl(process.env)}/sitemap.xml`,
  }
}
