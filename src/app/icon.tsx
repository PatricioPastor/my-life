import { ImageResponse } from "next/og"

export const size = { width: 64, height: 64 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0A0600" }}>
        <svg width="64" height="64" viewBox="0 0 100 100">
          <path d="M50 8 L57 43 L92 50 L57 57 L50 92 L43 57 L8 50 L43 43 Z" fill="#FFC15E" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
