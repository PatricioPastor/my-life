import type { FormErrors } from "./memory-form-model"

/**
 * The add-memory form in three steps: what to leave (a photo, the voice or both), the memory itself (the words, when and
 * where) and the orb's color. Each step checks only its own fields on Siguiente; saving happens on the last one.
 */
export type FormStep = 1 | 2 | 3

export const LAST_STEP = 3 satisfies FormStep

/** Each step's heading and, at most, one short line under it (neutral Spanish, `tú`). Each idea is said once. */
export const STEP_COPY = {
  1: { title: "¿Qué quieres dejar?", sub: "Una foto, tu voz o las dos." },
  2: { title: "Cuéntalo", sub: null },
  3: { title: "Elige su color", sub: "Así brillará en el universo." },
} as const satisfies Record<FormStep, { title: string; sub: string | null }>

/** The copy of the sheet around the steps. */
export const STEPPER_COPY = {
  next: "Siguiente",
  back: "Atrás",
  save: "Guardar recuerdo",
  close: "Cerrar",
  /** Under the color, the only place the approval is mentioned. */
  approval: "Lo verás en el universo cuando sea aprobado.",
  photo: {
    choose: "Elegir foto",
    change: "Cambiar foto",
    formats: "JPG, PNG, WEBP o HEIC · hasta 10 MB",
    remove: "Quitar foto",
    preview: "Vista previa",
  },
  caption: "¿Qué recuerdas?",
  when: "¿Cuándo fue?",
} as const

/** "Paso 2 de 3": the sheet's only kicker. */
export const kicker = (step: FormStep) => `Paso ${step} de ${LAST_STEP}`

/** What a screen reader hears when the step changes: "Paso 2 de 3: Cuéntalo". */
export const stepAnnouncement = (step: FormStep) => `${kicker(step)}: ${STEP_COPY[step].title}`

export type ErrorField = keyof FormErrors

/**
 * Every error's field, in the order the form shows them, with the step it lives on. What is about the whole save (a
 * failed upload, the daily limit) stays on the last step, next to Guardar recuerdo.
 */
const FIELDS: ReadonlyArray<readonly [ErrorField, FormStep]> = [
  ["media", 1],
  ["photo", 1],
  ["audio", 1],
  ["caption", 2],
  ["date", 2],
  ["time", 2],
  ["place", 2],
  ["form", 3],
]

/** The errors that belong to one step, without the empty ones. */
export function errorsOnStep(errors: FormErrors, step: FormStep): FormErrors {
  const found: FormErrors = {}
  for (const [field, on] of FIELDS) if (on === step && errors[field]) found[field] = errors[field]
  return found
}

/** The errors of every other step: what is left once a step is checked again. */
export function withoutStep(errors: FormErrors, step: FormStep): FormErrors {
  const kept: FormErrors = {}
  for (const [field, on] of FIELDS) if (on !== step && errors[field]) kept[field] = errors[field]
  return kept
}

/** Where the first error is: its step, and the first field on it in the form's order. Null when there is none. */
export function firstInvalid(errors: FormErrors): { step: FormStep; field: ErrorField } | null {
  const steps = FIELDS.filter(([field]) => errors[field]).map(([field, step]) => ({ step, field }))
  if (steps.length === 0) return null
  const step = Math.min(...steps.map((s) => s.step)) as FormStep
  return steps.find((s) => s.step === step)!
}
