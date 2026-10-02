"use client"

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react"
import { Dialog } from "radix-ui"
import { track } from "@/shared/analytics"
import { useKeyboardInset } from "@/shared/lib/use-keyboard-inset"
import { cn } from "@/shared/lib/utils"
import { CAPTION_MAX_LENGTH, EARLIEST_MEMORY_DATE } from "../memory"
import { DEFAULT_ORB_COLOR } from "../orb-color"
import { ORB_HUES, randomOrbHue } from "../orb-hues"
import type { MemoryView } from "../memory-view"
import { MAX_AUDIO_MS, checkAudio, checkPhoto } from "../upload-limits"
import type { CreateMemoryInput, CreateMemoryResult, PrepareUploadInput, PrepareUploadResult } from "../upload-view"
import { readAudioDuration, type ReadAudioDuration } from "./audio-duration"
import { AudioSection } from "./audio-section"
import type { UploadToCloudinary } from "./cloudinary-upload"
import { COPY, localToday, messageForFailure, validateForm, type FormErrors } from "./memory-form-model"
import {
  LAST_STEP,
  STEPPER_COPY,
  STEP_COPY,
  errorsOnStep,
  firstInvalid,
  kicker,
  stepAnnouncement,
  withoutStep,
  type ErrorField,
  type FormStep,
} from "./memory-steps"
import { WHEN_COPY, deriveWhen, localWhen, usableWhen, type When, type WhenOverrides } from "./memory-when"
import { readPhotoTaken, type PhotoTimeParser } from "./photo-exif"
import type { GpsParser } from "./photo-gps"
import { OrbColorPicker } from "./orb-color-picker"
import { orbSwatches, swatchFor } from "./photo-palette"
import { PLACE_COPY } from "./place-model"
import { PlaceSection } from "./place-section"
import { RELATED_COPY, chipText, type RelatedMemory } from "./related-memory"
import { SamePlaceOption } from "./same-place-option"
import { BUTTON_FACE, ERROR, FIELD, FOCUS, HINT, INPUT, LABEL, PANEL, PRESS } from "./sheet-styles"
import { useMapsLink, type ResolveLink } from "./use-maps-link"
import type { LevelEnv } from "./use-audio-level"
import { useAudioRecorder, type RecorderEnv } from "./use-audio-recorder"
import { usePhotoPalette, type ReadPalette } from "./use-photo-palette"
import { usePhotoPlace, type SuggestPlace } from "./use-photo-place"

export interface AddMemoryProps {
  /** The element the dialog mounts into, so it stays inside the stage (and its cursor). */
  container: HTMLElement | null
  prepare: (input: PrepareUploadInput) => Promise<PrepareUploadResult>
  create: (input: CreateMemoryInput) => Promise<CreateMemoryResult>
  upload: UploadToCloudinary
  /** Names the place of the photo's GPS position, called only once the visitor has consented to keep the place (a server action). */
  suggest: SuggestPlace
  /** Reads a pasted Google Maps link on the server (a server action). */
  resolveLink: ResolveLink
  /** Reads the GPS of the picked photo in the browser. Defaults to exifr, loaded on demand (a seam for tests). */
  parseGps?: GpsParser
  /** Reads when the picked photo was taken (its EXIF dates). Defaults to the same exifr read as the GPS (a seam for tests). */
  parsePhotoTime?: PhotoTimeParser
  /** Reads the colors of the picked photo for the orb swatches. Defaults to a small canvas in the browser (a seam for tests). */
  readPalette?: ReadPalette
  /** The random source the orb hue of a memory with no photo tones is drawn from (a seam for tests). Defaults to `Math.random`. */
  random?: () => number
  /** The microphone and `MediaRecorder` the audio section records with (a seam for tests). Defaults to the browser's. */
  recorderEnv?: RecorderEnv
  /** Reads how long a picked audio is (a seam for tests). Defaults to a throwaway `Audio` element. */
  readAudioDuration?: ReadAudioDuration
  /** The Web Audio the talking orb listens through (a seam for tests). Defaults to the browser's. */
  levelEnv?: LevelEnv
  /** Called with the new, still pending memory as soon as it is saved. */
  onCreated: (memory: MemoryView) => void
  /**
   * The memory the visitor is contributing from, or none. The date starts at its date, a chip says what the new memory is
   * related to (the visitor can remove it) and, when it has a place, "Mismo lugar" can keep it. Read each time it opens.
   */
  related?: RelatedMemory | null
  /** Controlled open state, for a parent that opens it from elsewhere (a memory's own Contribuir). Absent: it opens itself. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The visitor's local `YYYY-MM-DD` (a seam for tests). Defaults to the date on `clock`. */
  today?: string
  /**
   * The visitor's own clock (a seam for tests): when a recording starts, and what "later than now" means for a date and
   * time found in a photo or a file. Defaults to the browser's.
   */
  clock?: () => Date
  /** How long the typing of a link must pause before it is resolved. */
  linkDebounceMs?: number
  /** How long the confirmation stays before the dialog closes. */
  doneDelayMs?: number
}

type Phase = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "saving" } | { kind: "done" }
type StepState = "active" | "leaving" | "idle"
type StepsStyle = CSSProperties & { "--step-dir": string }

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
const STEPS: readonly FormStep[] = [1, 2, 3]
/** A footer button: 48 px, in the sheet padding, so it takes the panel radius. */
const ACTION = cn(PRESS, FOCUS, BUTTON_FACE, "flex h-12 items-center justify-center rounded-panel text-[length:var(--type-1)] leading-none disabled:opacity-60")
/** Where the focus goes for each field's error: the control itself (the audio's first control, inside its group). */
const FIELD_ID: Record<Exclude<ErrorField, "form">, string> = {
  media: "memory-photo",
  photo: "memory-photo",
  audio: "memory-audio",
  caption: "memory-caption",
  date: "memory-date",
  time: "memory-time",
  place: "memory-maps-link",
}

const browserClock = () => new Date()

function controlFor(field: ErrorField): HTMLElement | null {
  if (field === "form") return null
  const element = document.getElementById(FIELD_ID[field])
  if (field === "audio") return element?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? null
  return element
}

function buttonLabel(phase: Phase, step: FormStep): string {
  if (phase.kind === "uploading") return `Subiendo… ${phase.percent}%`
  if (phase.kind === "saving") return "Guardando…"
  return step < LAST_STEP ? STEPPER_COPY.next : STEPPER_COPY.save
}

const CloseIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
const PhotoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <rect x="2.5" y="4.5" width="17" height="13" rx="3" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3 15.5l4.6-4.2 3.4 3 2.6-2.3 5.4 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)

function MemoryForm({
  props,
  locked,
  onLockChange,
  onClose,
}: {
  props: AddMemoryProps
  locked: boolean
  onLockChange: (locked: boolean) => void
  onClose: () => void
}) {
  const clock = props.clock ?? browserClock
  const [today] = useState(() => props.today ?? localToday(clock()))
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [caption, setCaption] = useState("")
  // Contributed from a memory: the date starts at its date (the visitor can change it), and the chip can be removed.
  const [relation, setRelation] = useState<RelatedMemory | null>(props.related ?? null)
  // "¿Cuándo fue?" fills itself: each source keeps its own date and time, and the fields show what the visitor typed in
  // each one, else the best source's (see `deriveWhen`). The related memory's date stays a source even once its chip is
  // removed: it is the date the form started from.
  const [relatedWhen] = useState(() =>
    usableWhen(props.related ? { date: props.related.happenedOn, time: null } : null, clock()),
  )
  const [photoWhen, setPhotoWhen] = useState<When | null>(null)
  const [recordWhen, setRecordWhen] = useState<When | null>(null)
  const [fileWhen, setFileWhen] = useState<When | null>(null)
  const [typed, setTyped] = useState<WhenOverrides>({})
  const photoRun = useRef(0)
  // Off by default: the visitor opts in to keeping the place of this photo.
  // `auto` marks consent that a resolved link ticked by itself; `prior` is what the visitor had chosen before it did.
  // Only the visitor's own tick counts for the photo's position: clearing or editing the link gives `prior` back.
  const [consent, setConsent] = useState({ on: false, auto: false, prior: false })
  const shareLocation = consent.on
  const setShareLocation = (on: boolean) => setConsent({ on, auto: false, prior: on })
  const giveBackConsent = () => setConsent((c) => (c.auto ? { on: c.prior, auto: false, prior: c.prior } : c))
  // Off by default too: "Mismo lugar" keeps the place of the memory this one is related to. It and the photo's own place
  // (or a pasted link) are two ways to answer the same question, so choosing one lets go of the other.
  const [samePlace, setSamePlace] = useState(false)
  const [placeNotSaved, setPlaceNotSaved] = useState(false)
  // The swatch the visitor pressed; until they press one, the photo's dominant tone is the choice, or, with no tones to
  // go by (only a voice, or a photo it cannot read), a curated hue drawn once per open, so contributions vary.
  const [chosenColor, setChosenColor] = useState<string | null>(null)
  const [drawnHue] = useState(() => randomOrbHue(props.random))
  const { phase: palette, begin: readColors, reset: resetColors } = usePhotoPalette(props.readPalette)
  const recorder = useAudioRecorder(props.recorderEnv)
  const clip = recorder.clip
  const hasAudio = clip !== null && (recorder.state.phase === "recorded" || recorder.state.phase === "playing")
  // A source only counts while what it came from is still there: removing the photo or the audio recomputes the fields.
  const when = deriveWhen(
    {
      photo: picked ? photoWhen : null,
      recording: hasAudio && recorder.state.source === "recording" ? recordWhen : null,
      file: hasAudio && recorder.state.source === "file" ? fileWhen : null,
      related: relatedWhen,
    },
    typed,
  )
  // With a photo its own tones come first, then the curated hues; with only a voice, the curated hues alone.
  const tones = picked && palette.status === "ready" ? palette.colors : []
  const swatches = picked ? (palette.status === "ready" ? orbSwatches(tones) : []) : hasAudio ? ORB_HUES : []
  const proposed = tones.length > 0 ? swatchFor(swatches, tones[0]) : drawnHue
  const orbColor = swatches.length === 0 ? null : chosenColor && swatches.includes(chosenColor) ? chosenColor : proposed
  const audioRun = useRef(0)
  // A link that resolves is the visitor choosing the place: it counts as consent, which they can still untick.
  const link = useMapsLink(props.resolveLink, props.linkDebounceMs ?? 400, () => {
    setConsent((c) => (c.auto ? c : { on: true, auto: true, prior: c.on }))
    setSamePlace(false)
  })
  const linkPlace = link.state.status === "ok"
  // The photo's exact position goes to the server only once the visitor consents, and not while a link is the chosen place.
  const { place, begin: readPlace, reset: resetPlace } = usePhotoPlace(props.parseGps, props.suggest, shareLocation && !linkPlace)
  const hasPlace = place.status === "found" || linkPlace
  const [errors, setErrors] = useState<FormErrors>({})
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const controller = useRef<AbortController | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const previewUrl = useRef<string | null>(null)

  // The steps. The one being left stays on screen (out of reach) while it fades; `dir` tells the motion which way.
  const [step, setStep] = useState<FormStep>(1)
  const [leaving, setLeaving] = useState<FormStep | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const [announcement, setAnnouncement] = useState("")
  // Where the focus goes once a step is on screen: its heading, or the first field to fix. A new object each time asks again.
  const [focusAsk, setFocusAsk] = useState<{ to: ErrorField | "heading" } | null>(null)
  const headings = useRef<Array<HTMLHeadingElement | null>>([])
  const scroller = useRef<HTMLDivElement | null>(null)

  // Closing the form cancels an upload in flight, drops a photo still being read and frees the preview.
  useEffect(
    () => () => {
      controller.current?.abort()
      window.clearTimeout(timer.current)
      photoRun.current += 1
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    },
    [],
  )

  // After the step is on screen (its `hidden` is gone), so the focus can land in it.
  useEffect(() => {
    if (!focusAsk) return
    const target = focusAsk.to === "heading" ? headings.current[step - 1] : controlFor(focusAsk.to)
    target?.focus()
  }, [focusAsk, step])

  const busy = phase.kind === "uploading" || phase.kind === "saving"
  const settled = busy || phase.kind === "done"

  /** Shows a step and moves the focus to its heading, or to the field to fix. Going to the same step only moves the focus. */
  function show(next: FormStep, focus: ErrorField | "heading" = "heading") {
    if (next !== step) {
      setDir(next > step ? 1 : -1)
      setLeaving(step)
      setStep(next)
      setAnnouncement(stepAnnouncement(next))
      // A failed save is about the last step; it does not follow the visitor back.
      setErrors((e) => ({ ...e, form: undefined }))
      if (scroller.current) scroller.current.scrollTop = 0
    }
    setFocusAsk({ to: focus })
  }

  function choose(file: File | undefined) {
    if (!file || busy) return
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreviewFailed(false)
    // A new photo starts over: its own place and link, and no consent carried over from the previous one.
    setShareLocation(false)
    setChosenColor(null)
    link.reset()
    const check = checkPhoto(file)
    if (check !== "ok") {
      resetPlace()
      resetColors()
      forgetTaken()
      setPicked(null)
      setErrors((e) => ({ ...e, photo: check === "too_large" ? COPY.photoSize : COPY.photoType }))
      return
    }
    previewUrl.current = URL.createObjectURL(file)
    setPicked({ file, url: previewUrl.current })
    setErrors((e) => ({ ...e, photo: undefined, media: undefined }))
    void readPlace(file)
    void readColors(file)
    void readTaken(file)
  }

  /** When the picked photo was taken, from its EXIF. Each read supersedes the one before: a late answer is ignored. */
  async function readTaken(file: File) {
    const mine = ++photoRun.current
    setPhotoWhen(null)
    const taken = await readPhotoTaken(file, props.parsePhotoTime)
    if (mine !== photoRun.current) return
    setPhotoWhen(usableWhen(taken, clock()))
  }

  function forgetTaken() {
    photoRun.current += 1
    setPhotoWhen(null)
  }

  /** The recording's moment is when the visitor pressed Grabar, on their own clock. */
  function startRecording() {
    setRecordWhen(localWhen(clock()))
    return recorder.start()
  }

  function removePhoto() {
    if (busy) return
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreviewFailed(false)
    setPicked(null)
    setChosenColor(null)
    resetPlace()
    resetColors()
    forgetTaken()
    // The consent was for the photo's place; a pasted link that resolved keeps its own.
    if (!linkPlace) setShareLocation(false)
    setErrors((e) => ({ ...e, photo: undefined }))
  }

  async function chooseAudio(file: File | undefined) {
    if (!file || busy) return
    const mine = ++audioRun.current
    const check = checkAudio(file)
    if (check !== "ok") {
      recorder.discard()
      setErrors((e) => ({ ...e, media: undefined, audio: check === "too_large" ? COPY.audioSize : COPY.audioType }))
      return
    }
    setErrors((e) => ({ ...e, media: undefined, audio: undefined }))
    const duration = await (props.readAudioDuration ?? readAudioDuration)(file)
    if (mine !== audioRun.current) return
    if (duration !== null && duration > MAX_AUDIO_MS) {
      recorder.discard()
      setErrors((e) => ({ ...e, audio: COPY.audioLong }))
      return
    }
    // Only approximate: a file's date is when it last changed (a copy or an export moves it).
    setFileWhen(usableWhen(localWhen(file.lastModified), clock()))
    recorder.load(file, duration)
  }

  const onConsentChange = (next: boolean) => {
    setShareLocation(next)
    if (next) setSamePlace(false)
  }
  const onSamePlaceChange = (next: boolean) => {
    setSamePlace(next)
    if (next) setShareLocation(false)
  }
  const removeRelation = () => {
    setRelation(null)
    setSamePlace(false)
  }

  // Clearing the link of a photo with no GPS leaves nothing to keep, so the consent goes with it.
  const onLinkChange = (text: string) => {
    link.change(text)
    // The link no longer is the chosen place (cleared, or being read again): its consent does not pass to the photo.
    giveBackConsent()
    if (!text.trim() && place.status !== "found") setShareLocation(false)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0])
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer?.files?.[0])
  }

  /** Every check the server would make, plus the link: one still being read, or not understood, cannot stand for the place. */
  function check(): FormErrors {
    const found = validateForm({
      file: picked?.file ?? null,
      audio:
        hasAudio && clip
          ? { name: clip.name, type: clip.blob.type, size: clip.blob.size, durationMs: recorder.state.durationMs }
          : null,
      recording: recorder.state.phase === "recording" || recorder.state.phase === "requesting",
      caption,
      date: when.date,
      time: when.time,
      today,
    })
    if (link.text.trim() && !linkPlace) found.place = PLACE_COPY.linkBlocked
    return found
  }

  /** Puts the errors where they belong: the earliest step with one is shown, its first field focused. */
  const fail = (found: FormErrors) => {
    setErrors(found)
    setPhase({ kind: "idle" })
    onLockChange(false)
    const first = firstInvalid(found)
    if (first) show(first.step, first.field)
  }

  // Enter in a field submits the form: on the first two steps that is Siguiente, and only the last one saves.
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (settled) return
    const found = check()
    if (step < LAST_STEP) {
      const here = errorsOnStep(found, step)
      setErrors((e) => ({ ...withoutStep(e, step), ...here }))
      const first = firstInvalid(here)
      return first ? show(step, first.field) : show((step + 1) as FormStep)
    }
    const first = firstInvalid(found)
    if (first) {
      setErrors(found)
      return show(first.step, first.field)
    }
    setErrors({})
    void save()
  }

  async function save() {
    // Consent only counts while there is a place to keep (the photo's, or the link's).
    const share = shareLocation && hasPlace
    // "Mismo lugar" only counts while the memory it copies from is still the related one and has a place.
    const same = samePlace && relation?.place != null
    const abort = new AbortController()
    controller.current = abort
    setPhase({ kind: "uploading", percent: 0 })
    try {
      const photoFile = picked?.file ?? null
      const audioClip = hasAudio ? clip : null
      const prepared = await props.prepare({ photo: photoFile !== null, audio: audioClip !== null })
      if (abort.signal.aborted) return
      if (!prepared.ok) return fail(messageForFailure(prepared))

      // One progress bar for both files: each one counts for its share of the bytes.
      const photoBytes = photoFile?.size ?? 0
      const audioBytes = audioClip?.blob.size ?? 0
      const total = Math.max(photoBytes + audioBytes, 1)
      const progress = (before: number, bytes: number) => (percent: number) =>
        setPhase((p) =>
          p.kind === "uploading"
            ? { kind: "uploading", percent: Math.round(((before + (bytes * percent) / 100) / total) * 100) }
            : p,
        )

      // Each upload goes to its own Cloudinary endpoint with the fields the server signed for it.
      const { cloudName, photo: photoFields, audio: audioFields } = prepared.upload
      if (photoFile) {
        if (!photoFields) return fail({ form: COPY.unavailable })
        const sent = await props.upload({
          file: photoFile,
          cloudName,
          fields: photoFields,
          resource: "image",
          onProgress: progress(0, photoBytes),
          signal: abort.signal,
        })
        if (abort.signal.aborted || (!sent.ok && sent.reason === "cancelled")) return
        if (!sent.ok) return fail({ form: COPY.unavailable })
      }
      if (audioClip) {
        if (!audioFields) return fail({ form: COPY.unavailable })
        const sent = await props.upload({
          file: audioClip.blob,
          name: audioClip.name,
          cloudName,
          fields: audioFields,
          resource: "video",
          onProgress: progress(photoBytes, audioBytes),
          signal: abort.signal,
        })
        if (abort.signal.aborted || (!sent.ok && sent.reason === "cancelled")) return
        if (!sent.ok) return fail({ form: COPY.unavailable })
      }

      setPhase({ kind: "saving" })
      onLockChange(true)
      const created = await props.create({
        ticket: prepared.upload.ticket,
        caption: caption.trim(),
        happenedOn: when.date,
        // The visitor's wall clock as it is, or none: the server stores it with no time zone.
        happenedTime: when.time || null,
        shareLocation: share,
        // Only the link goes up: the server resolves it again and ignores anything else the browser saw.
        ...(linkPlace ? { mapsUrl: link.text.trim() } : {}),
        // The server only accepts a valid color that glows on the dark void, and otherwise uses the photo's own.
        ...(orbColor ? { orbColor } : {}),
        // Only ids go up: the server checks the memory is approved and visible, and copies its place itself.
        ...(relation ? { relatedMemoryId: relation.id, ...(same ? { samePlace: true } : {}) } : {}),
      })
      if (abort.signal.aborted) return
      if (!created.ok) return fail(messageForFailure(created))

      setPlaceNotSaved((share || same) && !created.locationSaved)
      track("memory_submitted")
      if (recorder.state.source === "recording") track("memory_audio_recorded")
      props.onCreated(created.memory)
      setPhase({ kind: "done" })
      onLockChange(false)
      timer.current = window.setTimeout(onClose, props.doneDelayMs ?? 1600)
    } catch {
      if (!abort.signal.aborted) fail({ form: COPY.unavailable })
    }
  }

  const count = [...caption].length
  const describe = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(" ") || undefined
  const photoDescribedBy = describe(
    !picked && "memory-photo-hint",
    errors.photo && "memory-photo-error",
    errors.media && "memory-media-error",
  )
  const captionDescribedBy = describe("memory-caption-count", errors.caption && "memory-caption-error")
  const whenHint = when.hint ? "memory-when-hint" : null
  const dateDescribedBy = describe(whenHint, errors.date && "memory-date-error")
  const timeDescribedBy = describe(whenHint, errors.time && "memory-time-error")
  const preview = picked && !previewFailed

  /** One step: its heading (focused when it arrives), at most one line under it, and its fields. */
  const panel = (n: FormStep, body: ReactNode) => {
    const state: StepState = n === step ? "active" : n === leaving ? "leaving" : "idle"
    const copy = STEP_COPY[n]
    return (
      <div
        key={n}
        data-step-panel={n}
        data-state={state}
        hidden={state === "idle"}
        aria-hidden={state === "leaving" ? true : undefined}
        inert={state === "leaving"}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && state === "leaving") setLeaving(null)
        }}
        className="mem-step flex flex-1 flex-col gap-6"
      >
        <div className="flex flex-col gap-1.5">
          <h3
            ref={(node) => {
              headings.current[n - 1] = node
            }}
            tabIndex={-1}
            className="t-title m-0 text-[length:var(--type-4)] text-balance text-[#f3f0ea] outline-none"
          >
            {copy.title}
          </h3>
          {copy.sub && <p className="t-body m-0 text-[length:var(--type-1)] text-pretty text-ink-muted">{copy.sub}</p>}
        </div>
        {body}
      </div>
    )
  }

  const whatToLeave = (
    <>
      {relation && (
        // In the sheet padding, so the panel radius; its remove button sits in the panel padding, so the inner radius.
        <div data-testid="related-chip" className={cn(PANEL, "flex h-12 min-w-0 items-center gap-2 p-panel pl-3.5")}>
          <span className="t-body min-w-0 flex-1 truncate text-[length:var(--type-1)] text-ink">{chipText(relation.caption)}</span>
          <button
            type="button"
            aria-label={RELATED_COPY.removeRelation}
            onClick={removeRelation}
            disabled={settled}
            data-magnetic="light"
            data-cursor-label={RELATED_COPY.removeRelation}
            className={cn(PRESS, "grid size-10 shrink-0 place-items-center rounded-inner text-ink-muted hover:bg-white/[0.08] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#a8c8ff] disabled:opacity-50")}
          >
            <CloseIcon size={10} />
          </button>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            id="memory-photo"
            type="file"
            accept={ACCEPT}
            onChange={onPick}
            disabled={settled}
            aria-labelledby="memory-photo-label"
            aria-describedby={photoDescribedBy}
            aria-invalid={errors.photo || errors.media ? true : undefined}
            className="peer sr-only"
          />
          {/* A tile of a stable height: the preview covers it, clipped by its radius, so picking a photo moves nothing. */}
          <label
            htmlFor="memory-photo"
            data-testid="photo-drop"
            data-magnetic="light"
            data-cursor-label={picked ? STEPPER_COPY.photo.change : STEPPER_COPY.photo.choose}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              PANEL,
              "relative flex h-44 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden p-4 text-center text-ink-muted transition-[background-color,box-shadow] duration-150 hover:bg-white/[0.06] [@media(max-height:520px)]:h-28",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#a8c8ff] peer-aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--signal)]",
              dragging && "bg-[#a8c8ff]/[0.08] shadow-[inset_0_0_0_1px_rgba(168,200,255,0.6)]",
            )}
          >
            {preview ? (
              // A local blob preview of the picked file: nothing to optimize, and `next/image` cannot take a blob.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.url}
                alt={STEPPER_COPY.photo.preview}
                onError={() => setPreviewFailed(true)}
                className="absolute inset-0 size-full rounded-panel object-cover outline-1 -outline-offset-1 outline-white/10"
              />
            ) : (
              <PhotoIcon />
            )}
            {picked && !preview && (
              <span className="t-body max-w-full truncate text-[length:var(--type-1)] text-ink">{picked.file.name}</span>
            )}
            <span
              id="memory-photo-label"
              className={picked ? "sr-only" : "t-body text-[length:var(--type-1)] leading-snug text-ink"}
            >
              {picked ? STEPPER_COPY.photo.change : STEPPER_COPY.photo.choose}
            </span>
            {!picked && (
              <span id="memory-photo-hint" className={cn(HINT, "text-xs")}>
                {STEPPER_COPY.photo.formats}
              </span>
            )}
          </label>
          {picked && (
            // A 44 px hit area in the tile's corner; the 32 px badge is centred in it, 6 px in from both edges, so its
            // radius is the tile's minus that inset (12 − 6 = 6): concentric with the corner it sits in.
            <button
              type="button"
              aria-label={STEPPER_COPY.photo.remove}
              onClick={removePhoto}
              disabled={settled}
              data-magnetic="light"
              data-cursor-label={STEPPER_COPY.photo.remove}
              className="group absolute top-0 right-0 size-11 outline-none disabled:opacity-50"
            >
              <span className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-[calc(var(--panel-r)-6px)] bg-[#07061a]/75 text-[#eaf0ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)] backdrop-blur-sm transition-[scale,background-color] duration-150 ease-out group-hover:bg-[#07061a]/90 group-active:group-enabled:scale-[0.96] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[#a8c8ff] motion-reduce:transition-none">
                <CloseIcon size={10} />
              </span>
            </button>
          )}
        </div>
        {errors.photo && (
          <p id="memory-photo-error" className={ERROR}>
            {errors.photo}
          </p>
        )}
        <AudioSection
          id="memory-audio"
          recorder={{ ...recorder, start: startRecording }}
          color={orbColor ?? DEFAULT_ORB_COLOR}
          disabled={settled}
          error={errors.audio}
          describedBy={errors.media ? "memory-media-error" : undefined}
          onPickFile={(file) => void chooseAudio(file)}
          levelEnv={props.levelEnv}
        />
        {errors.media && (
          <p id="memory-media-error" role="alert" className={ERROR}>
            {errors.media}
          </p>
        )}
      </div>
    </>
  )

  const theMemory = (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor="memory-caption" className={LABEL}>
          {STEPPER_COPY.caption}
        </label>
        {/* The counter sits inside the field's corner: it does not need a row of its own. */}
        <div className="relative">
          <textarea
            id="memory-caption"
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={settled}
            aria-describedby={captionDescribedBy}
            aria-invalid={errors.caption ? true : undefined}
            className={cn(FIELD, "min-h-28 resize-none pb-8")}
          />
          <span
            id="memory-caption-count"
            className={cn(
              "t-body pointer-events-none absolute right-3.5 bottom-2.5 text-sm leading-none tabular-nums",
              count > CAPTION_MAX_LENGTH ? "text-signal" : "text-ink-muted",
            )}
          >
            {count}/{CAPTION_MAX_LENGTH}
          </span>
        </div>
        {errors.caption && (
          <p id="memory-caption-error" className={ERROR}>
            {errors.caption}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="memory-date" className={LABEL}>
          {STEPPER_COPY.when}
        </label>
        {/* The date, and an optional time beside it. Both fill themselves from the photo or the audio. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] gap-2">
          <input
            id="memory-date"
            type="date"
            value={when.date}
            min={EARLIEST_MEMORY_DATE.toISOString().slice(0, 10)}
            max={today}
            onChange={(e) => setTyped((t) => ({ ...t, date: e.target.value }))}
            disabled={settled}
            aria-describedby={dateDescribedBy}
            aria-invalid={errors.date ? true : undefined}
            className={cn(INPUT, "tabular-nums [color-scheme:dark]")}
          />
          <input
            id="memory-time"
            type="time"
            aria-label={WHEN_COPY.time}
            value={when.time}
            onChange={(e) => setTyped((t) => ({ ...t, time: e.target.value }))}
            disabled={settled}
            aria-describedby={timeDescribedBy}
            aria-invalid={errors.time ? true : undefined}
            className={cn(INPUT, "tabular-nums [color-scheme:dark]")}
          />
        </div>
        {/* Where the date and time came from, until the visitor edits them. */}
        {when.hint && (
          <p id="memory-when-hint" data-approximate={when.approximate || undefined} className={HINT}>
            {when.hint}
          </p>
        )}
        {errors.date && (
          <p id="memory-date-error" className={ERROR}>
            {errors.date}
          </p>
        )}
        {errors.time && (
          <p id="memory-time-error" className={ERROR}>
            {errors.time}
          </p>
        )}
      </div>

      <PlaceSection
        place={place}
        link={{ text: link.text, state: link.state }}
        onLinkChange={onLinkChange}
        consent={shareLocation}
        onConsentChange={onConsentChange}
        disabled={settled}
        error={errors.place}
      >
        {relation?.place && (
          <SamePlaceOption place={relation.place} checked={samePlace} onChange={onSamePlaceChange} disabled={settled} />
        )}
      </PlaceSection>
    </>
  )

  const itsColor = (
    <>
      <OrbColorPicker
        status={picked ? palette.status : hasAudio ? "ready" : "idle"}
        colors={swatches}
        value={orbColor}
        fromPhoto={palette.status === "ready" ? palette.fromPhoto : true}
        voice={!picked && hasAudio}
        disabled={settled}
        onChange={setChosenColor}
      />
      {/* At the foot of the step, right above the footer. */}
      <p className={cn(HINT, "mt-auto text-center")}>{STEPPER_COPY.approval}</p>
    </>
  )

  const steps: Record<FormStep, ReactNode> = { 1: whatToLeave, 2: theMemory, 3: itsColor }
  const stepsStyle: StepsStyle = { "--step-dir": String(dir) }

  return (
    <form data-testid="memory-form" data-step={step} noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      {/*
        The close button sits exactly at the sheet padding from the corner (20 px down, 20 px in), so its 12 px radius
        shares the 32 px corner's centre.
      */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-sheet pt-sheet pb-4">
        <div className="flex flex-col gap-2">
          <p className="t-label m-0 tabular-nums text-ink-muted">{kicker(step)}</p>
          <div aria-hidden="true" className="flex w-24 gap-1">
            {STEPS.map((n) => (
              <span
                key={n}
                data-testid="step-segment"
                data-filled={n <= step}
                className={cn(
                  "h-1 flex-1 rounded-full transition-[background-color] duration-200 ease-out",
                  n > step ? "bg-white/15" : !orbColor && "bg-ink",
                )}
                style={n <= step && orbColor ? { backgroundColor: orbColor } : undefined}
              />
            ))}
          </div>
        </div>
        <Dialog.Close
          disabled={locked}
          aria-label={STEPPER_COPY.close}
          data-magnetic="light"
          data-cursor-label={STEPPER_COPY.close}
          className={cn(
            PRESS,
            FOCUS,
            "grid size-10 shrink-0 place-items-center rounded-panel bg-white/[0.06] text-ink-muted hover:bg-white/[0.11] hover:text-ink disabled:opacity-40",
          )}
        >
          <CloseIcon />
        </Dialog.Close>
      </div>

      {/* The ONE scroll region: whatever does not fit scrolls here, and the footer stays in reach. */}
      <div
        ref={scroller}
        data-testid="memory-scroll"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-sheet pt-2 pb-6"
      >
        <div data-testid="memory-steps" className="relative flex flex-1 flex-col" style={stepsStyle}>
          {STEPS.map((n) => panel(n, steps[n]))}
        </div>
      </div>
      <div data-testid="step-announcer" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/*
        Pinned under the scroll region, with the sheet padding on the sides and the bottom (plus the safe area): the
        buttons' 12 px corners nest in the sheet's 32 px ones. The primary is always the right-hand control, so its right
        edge never moves; Atrás comes in on its left from the second step.
      */}
      <div
        data-testid="memory-actions"
        className="flex shrink-0 flex-col gap-3 border-t border-white/[0.06] px-sheet pt-sheet pb-[calc(var(--sheet-pad)+env(safe-area-inset-bottom))]"
      >
        {errors.form && step === LAST_STEP && (
          <p id="memory-form-error" role="alert" className={ERROR}>
            {errors.form}
          </p>
        )}
        <p role="status" className="t-body m-0 text-[length:var(--type-1)] text-pretty text-ink empty:hidden">
          {phase.kind === "done"
            ? `Listo. Tu recuerdo quedó pendiente de aprobación.${placeNotSaved ? ` ${PLACE_COPY.notSaved}` : ""}`
            : ""}
        </p>
        <div data-testid="memory-actions-row" className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => show((step - 1) as FormStep)}
              disabled={settled}
              data-magnetic="light"
              data-cursor-label={STEPPER_COPY.back}
              className={cn(ACTION, "shrink-0 bg-white/[0.06] px-5 text-ink shadow-[inset_0_0_0_1px_rgba(168,200,255,0.14)] hover:bg-white/[0.11]")}
            >
              {STEPPER_COPY.back}
            </button>
          )}
          <button
            type="submit"
            // The second click of a double click on Siguiente would land on the next step's button: it is not a save.
            onClick={(event) => {
              if (event.detail > 1) event.preventDefault()
            }}
            disabled={settled}
            aria-busy={busy || undefined}
            aria-describedby={errors.form && step === LAST_STEP ? "memory-form-error" : undefined}
            data-magnetic="light"
            data-cursor-label={buttonLabel(phase, step)}
            className={cn(ACTION, "relative flex-1 overflow-hidden bg-[#eaf0ff] px-5 text-[#07061a] tabular-nums hover:bg-white")}
          >
            {/* The upload's progress fills the button itself: nothing appears under it, so the footer never grows. */}
            {phase.kind !== "idle" && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-[#a8c8ff]/50 transition-[width] duration-200 ease-out"
                style={{ width: phase.kind === "uploading" ? `${phase.percent}%` : "100%" }}
              />
            )}
            <span className="relative">{buttonLabel(phase, step)}</span>
          </button>
        </div>
      </div>
    </form>
  )
}

/**
 * The "Contribuir" control (a plus and the word, in the space's top bar) and the sheet it opens: three short steps
 * ("¿Qué quieres dejar?", "Cuéntalo", "Elige su color") under a "Paso N de 3" kicker, with Atrás and Siguiente (Guardar
 * recuerdo on the last) pinned at the foot. Part of the dark dimension, mounted inside the stage like the viewer. On
 * phones it is a bottom sheet (its own height, up to 92% of the screen); from md a centred dialog of a stable height.
 * Its corners are concentric all the way in: sheet 32, what sits in its 20 px padding 12, what sits in a 4 px panel 8.
 */
export function AddMemory(props: AddMemoryProps) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = props.open ?? ownOpen
  const setOpen = (next: boolean) => {
    // Controlled by a parent, it only asks; on its own it opens and closes itself.
    if (props.open === undefined) setOwnOpen(next)
    props.onOpenChange?.(next)
  }
  const [locked, setLocked] = useState(false)
  // On a phone the keyboard covers the bottom of the page: the sheet is lifted onto the part that stays visible.
  const keyboard = useKeyboardInset()
  // The sheet shrinks as the keyboard opens; the field being typed in is kept in view inside it.
  useEffect(() => {
    if (keyboard > 0) document.activeElement?.scrollIntoView?.({ block: "nearest" })
  }, [keyboard])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next || !locked) && setOpen(next)}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-magnetic="light"
          data-cursor-label="Contribuir"
          className="press t-label flex h-11 items-center gap-2.5 rounded-full border border-[#a8c8ff]/35 bg-[#07061a]/70 px-5 text-[#e6edff] shadow-[0_0_28px_rgba(140,170,255,0.14)] backdrop-blur-sm transition-colors duration-200 hover:border-[#a8c8ff]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          Contribuir
        </button>
      </Dialog.Trigger>
      <Dialog.Portal container={props.container}>
        {/* Above the journey's HUD (the way back), which is drawn after the stage. */}
        <Dialog.Overlay className="mem-scrim absolute inset-0 z-10 bg-[#020207]/80" />
        <Dialog.Content
          // The steps' headings and the live region say what each step is about; there is no separate description.
          aria-describedby={undefined}
          className="mem-viewer mem-sheet absolute inset-0 z-10 flex items-end justify-center overscroll-contain p-0 outline-none md:items-center md:p-6"
          // The card is the only part that takes pointers: a press on the empty stage falls through to the scrim and closes.
          style={{
            transformOrigin: "calc(100% - 120px) calc(100% - 90px)",
            pointerEvents: "none",
            paddingBottom: keyboard > 0 ? `${keyboard}px` : undefined,
          }}
        >
          <div
            data-testid="memory-card"
            className={cn(
              // A 1 px cool rim drawn as a shadow, outside the box: a border would push the padding 1 px off the radii.
              "pointer-events-auto relative flex w-full min-w-0 flex-col overflow-hidden rounded-t-sheet bg-[#080714] shadow-[0_0_0_1px_rgba(168,200,255,0.14),0_28px_90px_rgba(0,0,0,0.65)]",
              "max-h-[min(92dvh,calc(100%-max(0.5rem,env(safe-area-inset-top))))]",
              "md:h-[min(100%,680px)] md:max-h-none md:w-[min(30rem,calc(100vw-2rem))] md:rounded-sheet",
            )}
          >
            <div
              data-testid="sheet-handle"
              aria-hidden="true"
              className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20 md:hidden"
            />
            <Dialog.Title className="sr-only">{RELATED_COPY.title}</Dialog.Title>
            <MemoryForm props={props} locked={locked} onLockChange={setLocked} onClose={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
