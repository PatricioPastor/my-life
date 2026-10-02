import { describe, expect, it } from "vitest"
import { WHEN_COPY, deriveWhen, localWhen, usableWhen, type WhenCandidates } from "./memory-when"

const PHOTO = { date: "2024-03-14", time: "18:42" }
const RECORDING = { date: "2026-10-01", time: "09:15" }
const FILE = { date: "2025-12-24", time: "21:03" }
const RELATED = { date: "2023-07-04", time: null }
const ALL: WhenCandidates = { photo: PHOTO, recording: RECORDING, file: FILE, related: RELATED }

describe("deriveWhen", () => {
  it("shows nothing, and no hint, when there is no candidate and nothing typed", () => {
    expect(deriveWhen({}, {})).toEqual({ date: "", time: "", source: null, approximate: false, hint: null })
  })

  it("takes the photo first, then the recording, then the audio file, then the related memory", () => {
    expect(deriveWhen(ALL, {})).toMatchObject({ date: "2024-03-14", time: "18:42", source: "photo" })
    expect(deriveWhen({ ...ALL, photo: null }, {})).toMatchObject({ date: "2026-10-01", time: "09:15", source: "recording" })
    expect(deriveWhen({ file: FILE, related: RELATED }, {})).toMatchObject({ date: "2025-12-24", time: "21:03", source: "file" })
    expect(deriveWhen({ related: RELATED }, {})).toMatchObject({ date: "2023-07-04", time: "", source: "related" })
  })

  it("says where each one came from, in one short line", () => {
    expect(deriveWhen({ photo: PHOTO }, {}).hint).toBe("Desde tu foto")
    expect(deriveWhen({ recording: RECORDING }, {}).hint).toBe("Cuando empezaste a grabar")
    expect(deriveWhen({ file: FILE }, {}).hint).toBe("Según el archivo de audio")
    expect(deriveWhen({ related: RELATED }, {}).hint).toBe("Igual que el recuerdo relacionado")
    expect(Object.values(WHEN_COPY.hints)).toHaveLength(4)
  })

  it("marks only the audio file's date as approximate (it is when the file last changed)", () => {
    expect(deriveWhen({ file: FILE }, {}).approximate).toBe(true)
    for (const source of ["photo", "recording", "related"] as const) {
      expect(deriveWhen({ [source]: ALL[source] }, {}).approximate).toBe(false)
    }
  })

  it("recomputes when a candidate goes away: removing the photo falls back to the next one", () => {
    expect(deriveWhen({ photo: PHOTO, related: RELATED }, {}).date).toBe("2024-03-14")
    expect(deriveWhen({ photo: null, related: RELATED }, {})).toMatchObject({ date: "2023-07-04", time: "", source: "related" })
    expect(deriveWhen({ photo: null }, {})).toMatchObject({ date: "", time: "", source: null })
  })

  it("keeps what the visitor typed in a field over any candidate, field by field", () => {
    expect(deriveWhen(ALL, { date: "2020-01-02" })).toMatchObject({ date: "2020-01-02", time: "18:42" })
    expect(deriveWhen(ALL, { time: "07:30" })).toMatchObject({ date: "2024-03-14", time: "07:30" })
    expect(deriveWhen({}, { date: "2020-01-02", time: "07:30" })).toMatchObject({ date: "2020-01-02", time: "07:30" })
  })

  it("keeps a field the visitor cleared empty, instead of filling it again", () => {
    expect(deriveWhen(ALL, { time: "" })).toMatchObject({ date: "2024-03-14", time: "" })
    expect(deriveWhen(ALL, { date: "" })).toMatchObject({ date: "", time: "18:42" })
  })

  it("drops the hint once the visitor edits the date or the time", () => {
    expect(deriveWhen(ALL, { date: "2020-01-02" })).toMatchObject({ source: null, hint: null, approximate: false })
    expect(deriveWhen({ file: FILE }, { time: "" })).toMatchObject({ source: null, hint: null, approximate: false })
  })
})

describe("usableWhen", () => {
  // 1 October 2026, 18:30 on the visitor's own clock.
  const NOW = new Date(2026, 9, 1, 18, 30, 15)

  it("offers a past moment as it is", () => {
    expect(usableWhen(PHOTO, NOW)).toEqual(PHOTO)
    expect(usableWhen(RELATED, NOW)).toEqual(RELATED)
  })

  it("offers the current minute and today's date", () => {
    expect(usableWhen({ date: "2026-10-01", time: "18:30" }, NOW)).toEqual({ date: "2026-10-01", time: "18:30" })
    expect(usableWhen({ date: "2026-10-01", time: null }, NOW)).toEqual({ date: "2026-10-01", time: null })
  })

  it("ignores a moment later than now: a later minute today, or a later day", () => {
    expect(usableWhen({ date: "2026-10-01", time: "18:31" }, NOW)).toBeNull()
    expect(usableWhen({ date: "2026-10-02", time: "00:00" }, NOW)).toBeNull()
    expect(usableWhen({ date: "2026-10-02", time: null }, NOW)).toBeNull()
  })

  it("ignores a date before 1900-01-01, and keeps that day itself", () => {
    expect(usableWhen({ date: "1899-12-31", time: "23:59" }, NOW)).toBeNull()
    expect(usableWhen({ date: "1900-01-01", time: "00:00" }, NOW)).toEqual({ date: "1900-01-01", time: "00:00" })
  })

  it.each([
    ["no candidate", null],
    ["not a calendar day", { date: "2024-02-30", time: null }],
    ["a malformed date", { date: "14/03/2024", time: null }],
    ["a malformed time", { date: "2024-03-14", time: "25:00" }],
  ])("ignores %s", (_name, candidate) => {
    expect(usableWhen(candidate, NOW)).toBeNull()
  })
})

describe("localWhen", () => {
  it("reads the local calendar date and the local wall-clock time, to the minute", () => {
    expect(localWhen(new Date(2024, 2, 4, 8, 5, 59))).toEqual({ date: "2024-03-04", time: "08:05" })
    expect(localWhen(new Date(2024, 11, 31, 23, 59, 0))).toEqual({ date: "2024-12-31", time: "23:59" })
  })

  it("takes a timestamp in milliseconds, like File.lastModified", () => {
    expect(localWhen(new Date(2025, 11, 24, 21, 3).getTime())).toEqual({ date: "2025-12-24", time: "21:03" })
  })

  it.each([
    ["an invalid Date", new Date(Number.NaN)],
    ["NaN", Number.NaN],
    ["zero (a file with no known date)", 0],
    ["a negative timestamp", -1],
  ])("has nothing for %s", (_name, moment) => {
    expect(localWhen(moment)).toBeNull()
  })
})
