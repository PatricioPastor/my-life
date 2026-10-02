import { act, cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { VOLUME_KEY, rememberVolume, resetVolumeSession } from "./player-model"
import { useVolume } from "./use-volume"

function Probe() {
  const volume = useVolume()
  return <output>{volume.muted ? "muted" : Math.round(volume.volume * 100)}</output>
}

beforeEach(() => {
  resetVolumeSession()
  localStorage.clear()
})
afterEach(cleanup)

describe("useVolume", () => {
  it("renders full volume on the server even when a volume was kept (the markup must match what hydrates)", () => {
    localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: 0.6, muted: false }))
    expect(renderToString(<Probe />)).toContain("100")
  })

  it("reads the remembered volume once mounted", () => {
    localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: 0.6, muted: false }))
    render(<Probe />)
    expect(screen.getByRole("status").textContent).toBe("60")
  })

  it("follows a change made through rememberVolume", () => {
    render(<Probe />)
    act(() => {
      rememberVolume({ volume: 0.3, muted: false })
    })
    expect(screen.getByRole("status").textContent).toBe("30")
  })
})
