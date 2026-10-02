import { ImageResponse } from "next/og"
import { truncateCaption } from "@/features/memories/format"
import { findSharedMemory } from "@/features/memories/share/shared-memory"

/**
 * The link preview of an audio-only shared memory: an orb in its own color on the dark void, with the caption. Photos
 * preview as a signed Cloudinary crop instead, so they have no card here (404). The font is the one ImageResponse
 * bundles, so nothing is fetched at build or at request time.
 */
export const dynamic = "force-dynamic"

const SIZE = { width: 1200, height: 630 }
const VOID = "#040309"
const INK = "#f3f0ea"

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params
  const result = await findSharedMemory(token)
  // Only an audio-only memory has a drawn card: a photo's preview is the photo.
  if (!result.ok || result.ogImageUrl !== null) return new Response(null, { status: 404 })

  const { caption, orbColor } = result.memory
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: `radial-gradient(ellipse 70% 80% at 24% 50%, ${orbColor}33 0%, transparent 70%), ${VOID}`,
          color: INK,
          padding: "0 90px",
          gap: 72,
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            flexShrink: 0,
            borderRadius: 9999,
            display: "flex",
            background: `radial-gradient(circle at 36% 32%, #ffffff 0%, ${orbColor} 34%, ${orbColor}55 72%, transparent 100%)`,
            boxShadow: `0 0 140px 30px ${orbColor}66`,
          }}
        />
        {/* A fixed width (1200 - 2 x 90 padding - 300 orb - 72 gap), so the caption wraps instead of running off the card. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28, width: 558 }}>
          <div style={{ display: "flex", fontSize: 60, lineHeight: 1.14, letterSpacing: -1 }}>{truncateCaption(caption, 80)}</div>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#a9a5b8" }}>patriciopastor</div>
        </div>
      </div>
    ),
    { ...SIZE },
  )
}
