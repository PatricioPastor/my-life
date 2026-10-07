import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import RootLayout from "./layout"

// The faces next/font builds at compile time, and the analytics, have no place in a test: stand-ins render nothing.
vi.mock("next/font/google", () => {
  const face = () => ({ variable: "font", className: "font", style: { fontFamily: "font" } })
  return { Doto: face, Silkscreen: face, Spectral: face }
})
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }))
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }))
vi.mock("@next/third-parties/google", () => ({ GoogleAnalytics: () => null }))

/** The document the root layout renders, parsed as a browser would. */
const page = () =>
  new DOMParser().parseFromString(renderToStaticMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>), "text/html")

describe("the root layout's connections to Fontshare", () => {
  // A stylesheet link is a no-CORS request: a connection opened for CORS would go unused by it, so a plain preconnect.
  it("opens the stylesheets' host plain, as the stylesheet links (Gambarino's, Switzer's) request it", () => {
    const links = page().head.querySelectorAll(`link[rel="preconnect"][href="https://api.fontshare.com"]`)
    expect(links).toHaveLength(1)
    expect(links[0]!.hasAttribute("crossorigin")).toBe(false)
  })

  // Font files are always fetched with CORS, so their host's connection is opened for it.
  it("opens the font files' host for CORS", () => {
    const links = page().head.querySelectorAll(`link[rel="preconnect"][href="https://cdn.fontshare.com"]`)
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute("crossorigin")).toBe("anonymous")
  })
})
