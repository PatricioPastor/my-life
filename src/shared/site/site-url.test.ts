import { describe, expect, it } from "vitest"
import { resolveSiteUrl } from "./site-url"

describe("resolveSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }),
    ).toBe("https://example.com")
  })

  it("adds https:// to a bare host", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "example.com" })).toBe("https://example.com")
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "example.com/" })).toBe("https://example.com")
  })

  it("keeps an explicit http scheme", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://staging.example.com" })).toBe("http://staging.example.com")
  })

  it("ignores garbage and falls through to the next source", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "not a url ::", VERCEL_PROJECT_PRODUCTION_URL: "my-life.vercel.app" }),
    ).toBe("https://my-life.vercel.app")
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000")
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "ftp://example.com" })).toBe("http://localhost:3000")
  })

  it("normalizes a bare Vercel host too and ignores an invalid one", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "https://my-life.vercel.app/" })).toBe(
      "https://my-life.vercel.app",
    )
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "bad host" })).toBe("http://localhost:3000")
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

  it("always returns something new URL() accepts", () => {
    for (const value of ["example.com", "::", "  ", "https://a.b/c/", "http://", "//x", "a b"]) {
      expect(() => new URL(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: value }))).not.toThrow()
    }
  })
})
