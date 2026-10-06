import type { Metadata } from "next"

const SITE = "patriciopastor"

// The site's preview card, drawn by app/opengraph-image.tsx (resolved against metadataBase). Next merges that file's
// image only where it lives, so a page that sets its own preview loses it and has to name it again.
const PREVIEW_CARD = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE, type: "image/png" }

/** /trabajo as a link preview shows it. */
export const WORK_TITLE = "Trabajo"
export const WORK_DESCRIPTION = "Proyectos de Patricio Pastor: qué construí, cómo y por qué."

/**
 * A page of the public work galaxy: its own title (under the site's name) and description, in the link preview too.
 * Metadata merges shallowly, so the preview is spelled out whole, card included; otherwise it would keep the home's
 * invitation-only line. The work is the one part of the site open to search engines: it overrides the root layout's
 * noindex and names its canonical URL (`path`, resolved against the layout's metadataBase).
 */
export function workMetadata(title: string, description: string, path: string): Metadata {
  const full = `${title} · ${SITE}`
  return {
    title: full,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { title: full, description, type: "website", locale: "es_AR", siteName: SITE, images: [PREVIEW_CARD] },
    twitter: { card: "summary_large_image", title: full, description, images: [PREVIEW_CARD] },
  }
}
