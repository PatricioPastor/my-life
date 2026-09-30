import { ImageResponse } from "next/og"

export const alt = "patriciopastor"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const VOID = "#0A0600"
const GOLD = "#FFC15E"

// Four-point star: two thin diamonds crossed.
function Star({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 100 100">
      <path d="M50 0 L56 44 L100 50 L56 56 L50 100 L44 56 L0 50 L44 44 Z" fill={GOLD} />
    </svg>
  )
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          background: VOID,
          color: "#F7F1E8",
        }}
      >
        <Star px={160} />
        <div style={{ fontSize: 84, letterSpacing: 6 }}>patriciopastor</div>
      </div>
    ),
    { ...size },
  )
}
