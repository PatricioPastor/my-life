/**
 * What in an SVG could run, or reach outside the file, if someone opened it directly: public/ serves it on the site's
 * own origin, where an SVG document runs its scripts. Each hit is the offending fragment, so a failing check says where
 * to look; a clean file gives none. For tests over the shipped vectors (logos, marks and the technology isotypes).
 */
export function svgHazards(svg: string): string[] {
  const links = [...svg.matchAll(LINK)].filter((m) => !SAFE_TARGET.test(m[2] ?? m[3] ?? "")).map((m) => m[1]!)
  return [...RULES.flatMap((rule) => svg.match(rule) ?? []), ...links]
}

const RULES: readonly RegExp[] = [/<script\b/gi, /<foreignObject\b/gi, /\son[a-z]+\s*=/gi, /javascript:/gi]

/** Every `href` or `xlink:href`, with its value in either kind of quotes. */
const LINK = /(?<=[\s:])(href\s*=\s*(?:"([^"]*)"|'([^']*)'))/gi

/**
 * The only places a link may point: a fragment of the same file, or a raster image embedded in it (Zod's official mark
 * shades itself with two PNGs). An embedded SVG could carry a script of its own, so it is not one of them.
 */
const SAFE_TARGET = /^(?:#\S+|data:image\/(?:png|jpeg|webp)[;,])/i
