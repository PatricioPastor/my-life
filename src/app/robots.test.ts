// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "./robots"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("robots.txt", () => {
  it("lets every crawler in and points it at the sitemap on the site's origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://patriciopastor.dev/sitemap.xml",
    })
  })

  it("disallows nothing: the pages kept out of search say so themselves (noindex), and a crawler must reach them to read it", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://patriciopastor.dev")
    const { rules } = robots()
    for (const rule of [rules].flat()) expect(rule.disallow).toBeUndefined()
  })
})
