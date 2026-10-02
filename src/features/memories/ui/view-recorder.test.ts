import { describe, expect, it, vi } from "vitest"
import type { RecordViewResult } from "../views/view-result"
import { createViewRecorder } from "./view-recorder"

const answer = (result: RecordViewResult) => vi.fn<(id: string) => Promise<RecordViewResult>>(async () => result)

describe("createViewRecorder", () => {
  it("records a memory the first time it is asked for, and says whether the visitor was new", async () => {
    const record = answer({ ok: true, counted: true })
    expect(await createViewRecorder(record).record("a")).toBe(true)
    expect(record).toHaveBeenCalledWith("a")
    expect(await createViewRecorder(answer({ ok: true, counted: false })).record("a")).toBe(false)
  })

  it("asks once per memory for the whole session, however often it is asked", async () => {
    const record = answer({ ok: true, counted: true })
    const recorder = createViewRecorder(record)
    await recorder.record("a")
    expect(await recorder.record("a")).toBe(false)
    await recorder.record("b")
    await recorder.record("a")
    await recorder.record("b")
    expect(record.mock.calls.map((c) => c[0])).toEqual(["a", "b"])
  })

  it("asks once even when it is asked again while the first answer is still on its way", async () => {
    let resolve!: (r: RecordViewResult) => void
    const record = vi.fn(() => new Promise<RecordViewResult>((r) => (resolve = r)))
    const recorder = createViewRecorder(record)
    const first = recorder.record("a")
    expect(await recorder.record("a")).toBe(false)
    resolve({ ok: true, counted: true })
    expect(await first).toBe(true)
    expect(record).toHaveBeenCalledTimes(1)
  })

  it("never says counted for a refusal: the author, a pending memory, no session", async () => {
    for (const reason of ["no_session", "not_countable", "unavailable"] as const) {
      expect(await createViewRecorder(answer({ ok: false, reason })).record("a"), reason).toBe(false)
    }
  })

  it("swallows a failed call (a view that is not recorded changes nothing) and does not ask again", async () => {
    const record = vi.fn(async () => {
      throw new Error("offline")
    })
    const recorder = createViewRecorder(record)
    await expect(recorder.record("a")).resolves.toBe(false)
    await recorder.record("a")
    expect(record).toHaveBeenCalledTimes(1)
  })
})
