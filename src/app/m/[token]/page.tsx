import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { formatMemoryDate } from "@/features/memories/format"
import { findSharedMemory } from "@/features/memories/share/shared-memory"
import { SharedMemory } from "@/features/memories/ui/shared-memory"
import { resolveSiteUrl } from "@/shared/site/site-url"

/**
 * A shared memory, for a guest with a link and no session. Dynamic on purpose: the token is checked and the memory is
 * read at request time (as `app_user`, approved rows only), and `/` stays static. It reads no files (no `fs`).
 * A link that is invalid, whose memory is missing or not approved (or when the lookup fails) goes to the start.
 */
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

const NOINDEX = { index: false, follow: false } as const
const BYLINE = "Un recuerdo de patriciopastor"
const PREVIEW = { width: 1200, height: 630 } as const

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const result = await findSharedMemory(token)
  // A link that goes nowhere says nothing about any memory; the page itself redirects.
  if (!result.ok) return { robots: NOINDEX }

  const { memory, ogImageUrl } = result
  const description = `${formatMemoryDate(memory.happenedOn)} · ${BYLINE}`
  // A photo previews as its signed 1200x630 crop; an audio-only memory as a card drawn on the server.
  const image = ogImageUrl ?? `${resolveSiteUrl(process.env)}/m/${token}/og`
  return {
    title: memory.caption,
    description,
    robots: NOINDEX,
    openGraph: {
      title: memory.caption,
      description,
      type: "website",
      locale: "es_AR",
      siteName: "patriciopastor",
      images: [{ url: image, ...PREVIEW, alt: memory.caption }],
    },
    twitter: { card: "summary_large_image", title: memory.caption, description, images: [image] },
  }
}

export default async function SharedMemoryPage({ params }: Props) {
  const { token } = await params
  const result = await findSharedMemory(token)
  if (!result.ok) redirect("/")
  return <SharedMemory memory={result.memory} shareUrl={`${resolveSiteUrl(process.env)}/m/${token}`} />
}
