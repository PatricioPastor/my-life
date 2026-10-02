import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SuggestPlaceResult } from "../place/suggest-place"
import type { GpsParser } from "./photo-gps"
import { usePhotoPlace, type SuggestPlace } from "./use-photo-place"

afterEach(cleanup)

const EXACT = { latitude: -34.593701, longitude: -58.425123 }
const NAMED: SuggestPlaceResult = { ok: true, label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }
const photo = () => new Blob(["x"], { type: "image/jpeg" })

function setup(consent: boolean, parse: GpsParser = async () => EXACT) {
  const suggest = vi.fn<SuggestPlace>(async () => NAMED)
  const view = renderHook(({ consent: on }) => usePhotoPlace(parse, suggest, on), { initialProps: { consent } })
  return { suggest, ...view }
}

describe("usePhotoPlace", () => {
  it("reads the GPS locally but never calls the server before consent", async () => {
    const { result, suggest } = setup(false)
    await act(async () => result.current.begin(photo()))
    expect(result.current.place).toMatchObject({ status: "found", awaitingConsent: true, label: null, address: null, naming: false })
    expect(suggest).not.toHaveBeenCalled()
  })

  it("names the place right away when consent is already on", async () => {
    const { result, suggest } = setup(true)
    await act(async () => result.current.begin(photo()))
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest).toHaveBeenCalledWith({ lat: -34.593701, lng: -58.425123 })
    expect(result.current.place).toMatchObject({ status: "found", awaitingConsent: false, naming: false, label: "Palermo, Buenos Aires" })
  })

  it("names the place when consent is turned on later", async () => {
    const { result, suggest, rerender } = setup(false)
    await act(async () => result.current.begin(photo()))
    rerender({ consent: true })
    await waitFor(() => expect(result.current.place).toMatchObject({ naming: false, awaitingConsent: false, label: "Palermo, Buenos Aires" }))
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest).toHaveBeenCalledWith({ lat: -34.593701, lng: -58.425123 })
  })

  it("asks once per photo across toggles, and calls nothing when consent goes off", async () => {
    const { result, suggest, rerender } = setup(false)
    await act(async () => result.current.begin(photo()))
    rerender({ consent: true })
    await waitFor(() => expect(result.current.place).toMatchObject({ naming: false, label: "Palermo, Buenos Aires" }))
    rerender({ consent: false })
    rerender({ consent: true })
    rerender({ consent: false })
    rerender({ consent: true })
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(result.current.place).toMatchObject({ label: "Palermo, Buenos Aires" })
  })

  it("asks again for the next photo (once)", async () => {
    const { result, suggest, rerender } = setup(true)
    await act(async () => result.current.begin(photo()))
    rerender({ consent: false })
    await act(async () => result.current.begin(photo()))
    expect(suggest).toHaveBeenCalledTimes(1)
    rerender({ consent: true })
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2))
  })

  it("makes no call for a photo without GPS", async () => {
    const { result, suggest, rerender } = setup(true, async () => undefined)
    await act(async () => result.current.begin(photo()))
    rerender({ consent: false })
    rerender({ consent: true })
    expect(result.current.place).toEqual({ status: "none" })
    expect(suggest).not.toHaveBeenCalled()
  })

  it("makes no call after reset, even if consent is turned on", async () => {
    const { result, suggest, rerender } = setup(false)
    await act(async () => result.current.begin(photo()))
    act(() => result.current.reset())
    rerender({ consent: true })
    expect(suggest).not.toHaveBeenCalled()
    expect(result.current.place).toEqual({ status: "idle" })
  })

  it("ignores a slow answer for a photo that is no longer picked", async () => {
    const { result, suggest } = setup(true)
    let finish!: (r: SuggestPlaceResult) => void
    suggest.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await act(async () => {
      void result.current.begin(photo())
    })
    await waitFor(() => expect(result.current.place).toMatchObject({ naming: true }))
    act(() => result.current.reset())
    await act(async () => finish(NAMED))
    expect(result.current.place).toEqual({ status: "idle" })
  })

  it("falls back to no label when the call fails", async () => {
    const { result, suggest } = setup(true)
    suggest.mockRejectedValueOnce(new Error("down"))
    await act(async () => result.current.begin(photo()))
    expect(result.current.place).toMatchObject({ status: "found", naming: false, label: null, address: null })
  })
})
