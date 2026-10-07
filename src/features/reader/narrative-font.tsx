import { preconnect } from "react-dom"

/**
 * Switzer, the case studies' narrative face, roman and italic, each one variable font (weights 100–900): `@1` and `@2`
 * are Fontshare's ids for its Variable and Variable Italic styles. Its license (ITF FFL v2.0) forbids redistributing,
 * subsetting or converting the files, and this repository is public, so the face is only ever served by Fontshare's
 * API, never committed or self-hosted. `display=swap`: the text shows in the fallback until the face arrives.
 */
export const SWITZER_CSS = "https://api.fontshare.com/v2/css?f[]=switzer@1,2&display=swap"

/**
 * Loads the narrative face wherever a case study renders, and nowhere else. React hoists the stylesheet into the head,
 * once however many render it. The connections open as soon as it renders: the stylesheet's host without CORS (a
 * stylesheet link is a no-CORS request), the font files' host with it (fonts are always fetched with CORS).
 */
export function NarrativeFont() {
  preconnect("https://api.fontshare.com")
  preconnect("https://cdn.fontshare.com", { crossOrigin: "anonymous" })
  return <link rel="stylesheet" href={SWITZER_CSS} precedence="font" />
}
