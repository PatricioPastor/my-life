import { describe, expect, it } from "vitest"
import { COPY } from "./memory-form-model"
import { PLACE_COPY } from "./place-model"
import {
  LAST_STEP,
  STEPPER_COPY,
  STEP_COPY,
  errorsOnStep,
  firstInvalid,
  kicker,
  stepAnnouncement,
  withoutStep,
} from "./memory-steps"

describe("the three steps", () => {
  it("asks what to leave, then for the memory, then for its color", () => {
    expect(LAST_STEP).toBe(3)
    expect(STEP_COPY[1]).toEqual({ title: "¿Qué quieres dejar?", sub: "Una foto, tu voz o las dos." })
    expect(STEP_COPY[2]).toEqual({ title: "Cuéntalo", sub: null })
    expect(STEP_COPY[3]).toEqual({ title: "Elige su color", sub: "Así brillará en el universo." })
  })

  it("counts the steps for the kicker and announces each one with its title", () => {
    expect(kicker(1)).toBe("Paso 1 de 3")
    expect(stepAnnouncement(2)).toBe("Paso 2 de 3: Cuéntalo")
    expect(stepAnnouncement(3)).toBe("Paso 3 de 3: Elige su color")
  })

  it("names the actions plainly, and says once when the memory will show", () => {
    expect(STEPPER_COPY).toMatchObject({ next: "Siguiente", back: "Atrás", save: "Guardar recuerdo", close: "Cerrar" })
    expect(STEPPER_COPY.approval).toBe("Lo verás en el universo cuando sea aprobado.")
  })

  it("speaks neutral Spanish with tú, never voseo", () => {
    expect(JSON.stringify({ STEP_COPY, STEPPER_COPY })).not.toMatch(/\b(querés|elegí|contá|agregá|podés|tenés)\b/i)
  })
})

describe("errorsOnStep", () => {
  const all = {
    media: COPY.media,
    audio: COPY.audioRecording,
    caption: COPY.caption,
    date: COPY.dateInvalid,
    time: COPY.timeInvalid,
    place: PLACE_COPY.linkBlocked,
    form: COPY.unavailable,
  }

  it("keeps the photo, the voice and the media on the first step", () => {
    expect(errorsOnStep({ ...all, photo: COPY.photoType }, 1)).toEqual({
      media: COPY.media,
      photo: COPY.photoType,
      audio: COPY.audioRecording,
    })
  })

  it("keeps the words, the date, the time and the place on the second step", () => {
    expect(errorsOnStep(all, 2)).toEqual({
      caption: COPY.caption,
      date: COPY.dateInvalid,
      time: COPY.timeInvalid,
      place: PLACE_COPY.linkBlocked,
    })
  })

  it("keeps what is about the whole save on the last step", () => {
    expect(errorsOnStep(all, 3)).toEqual({ form: COPY.unavailable })
  })

  it("drops the errors with no message", () => {
    expect(errorsOnStep({ caption: undefined, date: COPY.dateFuture }, 2)).toEqual({ date: COPY.dateFuture })
  })
})

describe("withoutStep", () => {
  it("clears one step's errors and leaves the others", () => {
    expect(withoutStep({ media: COPY.media, caption: COPY.caption, form: COPY.unavailable }, 2)).toEqual({
      media: COPY.media,
      form: COPY.unavailable,
    })
  })
})

describe("firstInvalid", () => {
  it("is nothing for a form with no errors", () => {
    expect(firstInvalid({})).toBeNull()
    expect(firstInvalid({ caption: undefined })).toBeNull()
  })

  it("is the earliest step with an error, and its first field in the order the form shows them", () => {
    expect(firstInvalid({ date: COPY.dateFuture, caption: COPY.caption })).toEqual({ step: 2, field: "caption" })
    expect(firstInvalid({ place: PLACE_COPY.linkBlocked, time: COPY.timeInvalid })).toEqual({ step: 2, field: "time" })
    expect(firstInvalid({ caption: COPY.caption, audio: COPY.audioLong })).toEqual({ step: 1, field: "audio" })
    expect(firstInvalid({ audio: COPY.audioLong, photo: COPY.photoSize })).toEqual({ step: 1, field: "photo" })
    expect(firstInvalid({ form: COPY.rateLimited })).toEqual({ step: 3, field: "form" })
  })
})
