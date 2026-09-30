import { describe, expect, it } from "vitest"
import { resolveSiteUrl } from "./site-url"

describe("resolveSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }),
    ).toBe("https://example.com")
  })

  it("falls back to the Vercel production host over https", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "my-life.vercel.app" })).toBe("https://my-life.vercel.app")
  })

  it("falls back to localhost when nothing is set or the values are blank", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000")
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  ", VERCEL_PROJECT_PRODUCTION_URL: "" })).toBe(
      "http://localhost:3000",
    )
  })
})
