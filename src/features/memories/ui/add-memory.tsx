"use client"

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { Dialog } from "radix-ui"
import { track } from "@/shared/analytics"
import { useKeyboardInset } from "@/shared/lib/use-keyboard-inset"
import { cn } from "@/shared/lib/utils"
import { CAPTION_MAX_LENGTH, EARLIEST_MEMORY_DATE } from "../memory"
import { DEFAULT_ORB_COLOR } from "../orb-color"
import type { MemoryView } from "../memory-view"
import { MAX_AUDIO_MS, checkAudio, checkPhoto } from "../upload-limits"
import type { CreateMemoryInput, CreateMemoryResult, PrepareUploadInput, PrepareUploadResult } from "../upload-view"
import { readAudioDuration, type ReadAudioDuration } from "./audio-duration"
import { AudioSection } from "./audio-section"
import type { UploadToCloudinary } from "./cloudinary-upload"
import { COPY, localToday, messageForFailure, validateForm, type FormErrors } from "./memory-form-model"
import type { GpsParser } from "./photo-gps"
import { OrbColorPicker } from "./orb-color-picker"
import { fallbackPalette } from "./photo-palette"
import { PLACE_COPY } from "./place-model"
import { PlaceSection } from "./place-section"
import { RELATED_COPY, chipText, type RelatedMemory } from "./related-memory"
import { SamePlaceOption } from "./same-place-option"
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
  /** Reads the colors of the picked photo for the orb swatches. Defaults to a small canvas in the browser (a seam for tests). */
  readPalette?: ReadPalette
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
  /** The visitor's local `YYYY-MM-DD` (a seam for tests). */
  today?: string
  /** How long the typing of a link must pause before it is resolved. */
  linkDebounceMs?: number
  /** How long the confirmation stays before the dialog closes. */
  doneDelayMs?: number
}

type Phase = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "saving" } | { kind: "done" }

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
const RIM = "border border-[#a8c8ff]/25"
const FIELD_CLASS = cn(
  RIM,
  "w-full rounded-sm bg-white/[0.04] px-3 py-2.5 text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint",
  "focus-visible:border-[#a8c8ff]/70 aria-[invalid=true]:border-signal/70",
)
const LABEL_CLASS = "t-label text-ink-muted"
const ERROR_CLASS = "t-body m-0 text-[length:var(--type-1)] leading-snug text-signal"

function buttonLabel(phase: Phase): string {
  if (phase.kind === "uploading") return `Subiendo… ${phase.percent}%`
  if (phase.kind === "saving") return "Guardando…"
  return "Guardar recuerdo"
}

function MemoryForm({
  props,
  onLockChange,
  onClose,
}: {
  props: AddMemoryProps
  onLockChange: (locked: boolean) => void
  onClose: () => void
}) {
  const [today] = useState(() => props.today ?? localToday())
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [caption, setCaption] = useState("")
  // Contributed from a memory: the date starts at its date (the visitor can change it), and the chip can be removed.
  const [relation, setRelation] = useState<RelatedMemory | null>(props.related ?? null)
  const [date, setDate] = useState(props.related?.happenedOn ?? "")
  // Off by default: the visitor opts in to keeping the place of this photo.
  const [shareLocation, setShareLocation] = useState(false)
  // Off by default too: "Mismo lugar" keeps the place of the memory this one is related to. It and the photo's own place
  // (or a pasted link) are two ways to answer the same question, so choosing one lets go of the other.
  const [samePlace, setSamePlace] = useState(false)
  const [placeNotSaved, setPlaceNotSaved] = useState(false)
  // The swatch the visitor pressed; until they press one, the dominant tone (the first swatch) is the choice.
  const [chosenColor, setChosenColor] = useState<string | null>(null)
  const { phase: palette, begin: readColors, reset: resetColors } = usePhotoPalette(props.readPalette)
  const recorder = useAudioRecorder(props.recorderEnv)
  const clip = recorder.clip
  const hasAudio = clip !== null && (recorder.state.phase === "recorded" || recorder.state.phase === "playing")
  // With a photo the swatches come from it; with only a voice they are the site's own, lifted to glow.
  const [voiceSwatches] = useState(fallbackPalette)
  const swatches = picked ? (palette.status === "ready" ? palette.colors : []) : hasAudio ? voiceSwatches : []
  const orbColor = chosenColor && swatches.includes(chosenColor) ? chosenColor : (swatches[0] ?? null)
  const audioRun = useRef(0)
  // A link that resolves is the visitor choosing the place: it counts as consent, which they can still untick.
  const link = useMapsLink(props.resolveLink, props.linkDebounceMs ?? 400, () => {
    setShareLocation(true)
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

  // Closing the form cancels an upload in flight and frees the preview.
  useEffect(
    () => () => {
      controller.current?.abort()
      window.clearTimeout(timer.current)
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    },
    [],
  )

  const busy = phase.kind === "uploading" || phase.kind === "saving"

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
      setPicked(null)
      setErrors((e) => ({ ...e, photo: check === "too_large" ? COPY.photoSize : COPY.photoType }))
      return
    }
    previewUrl.current = URL.createObjectURL(file)
    setPicked({ file, url: previewUrl.current })
    setErrors((e) => ({ ...e, photo: undefined, media: undefined }))
    void readPlace(file)
    void readColors(file)
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
    if (!text.trim() && place.status !== "found") setShareLocation(false)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0])
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer?.files?.[0])
  }

  const fail = (found: FormErrors) => {
    setErrors(found)
    setPhase({ kind: "idle" })
    onLockChange(false)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || phase.kind === "done") return
    const found = validateForm({
      file: picked?.file ?? null,
      audio:
        hasAudio && clip
          ? { name: clip.name, type: clip.blob.type, size: clip.blob.size, durationMs: recorder.state.durationMs }
          : null,
      recording: recorder.state.phase === "recording" || recorder.state.phase === "requesting",
      caption,
      date,
      today,
    })
    if (found.media || found.photo || found.audio || found.caption || found.date) {
      setErrors(found)
      return
    }
    // A link that is still being read, or that failed, must not be silently replaced by the photo's own place.
    if (link.text.trim() && !linkPlace) {
      setErrors({ form: PLACE_COPY.linkBlocked })
      return
    }
    setErrors({})
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
        happenedOn: date,
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
  const photoDescribedBy = ["memory-photo-hint", errors.photo && "memory-photo-error"].filter(Boolean).join(" ")
  const captionDescribedBy = ["memory-caption-count", errors.caption && "memory-caption-error"].filter(Boolean).join(" ")

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      {/* The ONE scroll region: phones scroll the fields here and nowhere else; desktop fits and never scrolls. */}
      <div data-testid="memory-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 md:px-8 md:pb-4">
        <div data-testid="memory-columns" className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-x-8">
          {relation && (
            <div data-testid="related-chip" className="flex min-w-0 max-w-full w-fit items-center gap-1 md:col-start-2 md:row-start-1 rounded-full border border-[#a8c8ff]/30 bg-[#a8c8ff]/[0.07] pl-4 text-ink">
              <span className="t-body min-w-0 truncate text-[length:var(--type-1)]">{chipText(relation.caption)}</span>
              <button
                type="button"
                aria-label={RELATED_COPY.removeRelation}
                onClick={removeRelation}
                disabled={busy || phase.kind === "done"}
                data-magnetic="light"
                data-cursor-label={RELATED_COPY.removeRelation}
                className="press grid h-11 w-11 shrink-0 place-items-center text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#a8c8ff] disabled:opacity-50"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
          <div className={cn("flex flex-col gap-5 md:gap-4", relation && "md:row-span-2 md:row-start-1")}>
            <div className="flex flex-col gap-2">
              <label id="memory-photo-label" htmlFor="memory-photo" className={LABEL_CLASS}>
                Foto
              </label>
              <input
                id="memory-photo"
                type="file"
                accept={ACCEPT}
                onChange={onPick}
                disabled={busy || phase.kind === "done"}
                aria-labelledby="memory-photo-label"
                aria-describedby={photoDescribedBy}
                aria-invalid={errors.photo ? true : undefined}
                className="peer sr-only"
              />
              {/* A fixed-height box: the preview fills it, so picking a photo never moves what is below. */}
              <div className="relative">
              <label
                htmlFor="memory-photo"
                data-testid="photo-drop"
                data-magnetic="light"
                data-cursor-label="Elegir foto"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  RIM,
                  "flex h-36 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-sm border-dashed bg-white/[0.03] p-3 text-center transition-colors duration-200 md:h-36 [@media(max-height:520px)]:h-20",
                  "peer-focus-visible:border-[#a8c8ff]/70 peer-aria-[invalid=true]:border-signal/70",
                  dragging && "border-[#a8c8ff]/70 bg-[#a8c8ff]/[0.07]",
                )}
              >
                {picked && !previewFailed && (
                  // A local blob preview of the picked file: nothing to optimize, and `next/image` cannot take a blob.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={picked.url}
                    alt="Vista previa"
                    onError={() => setPreviewFailed(true)}
                    className="min-h-0 w-full flex-1 rounded-sm object-contain"
                  />
                )}
                {picked ? (
                  <span className="max-w-full shrink-0 truncate text-xs tracking-[0.06em] text-ink-muted">{picked.file.name}</span>
                ) : (
                  <span className="t-body text-[length:var(--type-1)] text-ink-muted">
                    Elige una foto
                    <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline"> o arrástrala aquí</span>
                  </span>
                )}
              </label>
              {picked && (
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={removePhoto}
                  disabled={busy || phase.kind === "done"}
                  data-magnetic="light"
                  data-cursor-label="Quitar foto"
                  className="press absolute top-0 right-0 grid size-11 place-items-center focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#a8c8ff] disabled:opacity-50"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-[#07061a]/80 text-[#eaf0ff] ring-1 ring-[#a8c8ff]/35">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
              )}
              </div>
              <p id="memory-photo-hint" className="m-0 text-xs tracking-[0.04em] text-ink-muted">
                JPG, PNG, WebP o HEIC, hasta 10 MB.
              </p>
              {errors.photo && (
                <p id="memory-photo-error" className={ERROR_CLASS}>
                  {errors.photo}
                </p>
              )}
            </div>

            <AudioSection
              recorder={recorder}
              color={orbColor ?? DEFAULT_ORB_COLOR}
              disabled={busy || phase.kind === "done"}
              error={errors.audio ?? errors.media}
              onPickFile={(file) => void chooseAudio(file)}
              levelEnv={props.levelEnv}
            />

            <OrbColorPicker
              status={picked ? palette.status : hasAudio ? "ready" : "idle"}
              colors={swatches}
              value={orbColor}
              fromPhoto={palette.status === "ready" ? palette.fromPhoto : true}
              voice={!picked && hasAudio}
              disabled={busy || phase.kind === "done"}
              onChange={setChosenColor}
            />
          </div>

          <div className={cn("flex flex-col gap-5 md:gap-4", relation && "md:col-start-2 md:row-start-2")}>
            <div className="flex flex-col gap-2">
              <label htmlFor="memory-caption" className={LABEL_CLASS}>
                ¿Qué recuerdas?
              </label>
              {/* The counter sits inside the field's corner: it does not need a row of its own. */}
              <div className="relative">
                <textarea
                  id="memory-caption"
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={busy || phase.kind === "done"}
                  aria-describedby={captionDescribedBy}
                  aria-invalid={errors.caption ? true : undefined}
                  className={cn(FIELD_CLASS, "t-body resize-none pb-6 text-[length:var(--type-1)] md:h-[5.75rem]")}
                />
                <span
                  id="memory-caption-count"
                  className={cn(
                    "pointer-events-none absolute right-3 bottom-2 text-xs tabular-nums tracking-[0.04em]",
                    count > CAPTION_MAX_LENGTH ? "text-signal" : "text-ink-muted",
                  )}
                >
                  {count}/{CAPTION_MAX_LENGTH}
                </span>
              </div>
              {errors.caption && (
                <p id="memory-caption-error" className={ERROR_CLASS}>
                  {errors.caption}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="memory-date" className={LABEL_CLASS}>
                ¿Cuándo fue?
              </label>
              <input
                id="memory-date"
                type="date"
                value={date}
                min={EARLIEST_MEMORY_DATE.toISOString().slice(0, 10)}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy || phase.kind === "done"}
                aria-describedby={errors.date ? "memory-date-error" : undefined}
                aria-invalid={errors.date ? true : undefined}
                className={cn(FIELD_CLASS, "[color-scheme:dark]")}
              />
              {errors.date && (
                <p id="memory-date-error" className={ERROR_CLASS}>
                  {errors.date}
                </p>
              )}
            </div>

            {relation?.place && (
              <SamePlaceOption
                place={relation.place}
                checked={samePlace}
                onChange={onSamePlaceChange}
                disabled={busy || phase.kind === "done"}
              />
            )}
            <PlaceSection
              place={place}
              link={{ text: link.text, state: link.state }}
              onLinkChange={onLinkChange}
              consent={shareLocation}
              onConsentChange={onConsentChange}
              disabled={busy || phase.kind === "done"}
            />
          </div>
        </div>
      </div>

      {/* Outside the scroll region, so the submit and what it reports are always in reach. On desktop it sits under the right column. */}
      <div
        data-testid="memory-actions"
        className="grid shrink-0 gap-2 border-t border-[#a8c8ff]/15 bg-[#080714] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-x-8 md:px-8 md:pb-4 [@media(max-height:520px)]:pt-2 [@media(max-height:520px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {errors.form && (
            <p id="memory-form-error" role="alert" className={ERROR_CLASS}>
              {errors.form}
            </p>
          )}
          <p role="status" className="t-body m-0 text-[length:var(--type-1)] text-ink empty:hidden">
            {phase.kind === "done"
              ? `Listo. Tu recuerdo quedó pendiente de aprobación.${placeNotSaved ? ` ${PLACE_COPY.notSaved}` : ""}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy || phase.kind === "done"}
            aria-busy={busy || undefined}
            aria-describedby={errors.form ? "memory-form-error" : undefined}
            data-magnetic="light"
            data-cursor-label="Guardar recuerdo"
            className="press t-label flex h-12 w-full items-center justify-center rounded-sm border border-[#a8c8ff]/45 bg-[#a8c8ff]/[0.1] text-[#eaf0ff] tabular-nums transition-colors duration-200 hover:bg-[#a8c8ff]/[0.18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff] disabled:opacity-60"
          >
            {buttonLabel(phase)}
          </button>
          {phase.kind !== "idle" && (
            <div aria-hidden="true" className="h-px w-full overflow-hidden bg-white/10">
              <div
                className="h-full bg-[#a8c8ff]/70 transition-[width] duration-200 ease-out"
                style={{ width: phase.kind === "uploading" ? `${phase.percent}%` : "100%" }}
              />
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

/**
 * The "Contribuir" control (a plus and the word, in the space's top bar) and the dialog it opens: a photo and/or an audio (recorded or uploaded), the color of
 * the orb, a few words, a date and the place. The dialog is part of the dark dimension (a translucent panel with a fine cool rim), mounted inside the stage
 * like the viewer. On phones it is a bottom sheet (one scroll region, the submit always in reach); on tablets and
 * desktops it is a two-column card that fits without scrolling.
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
              RIM,
              "pointer-events-auto relative flex h-[calc(100%-max(0.5rem,env(safe-area-inset-top)))] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border-b-0 bg-[#080714] shadow-[0_0_0_1px_rgba(168,200,255,0.06),0_28px_90px_rgba(0,0,0,0.65)] backdrop-blur-md",
              "md:h-[min(100%,690px)] md:max-w-[900px] md:rounded-md md:border-b",
            )}
          >
            <div className="relative shrink-0 px-5 pt-2.5 pb-3 md:px-8 md:pt-5 md:pb-3 [@media(max-height:520px)]:pt-2 [@media(max-height:520px)]:pb-1.5">
              <div data-testid="sheet-handle" aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 md:hidden" />
              <div className="flex flex-col gap-1 pr-16">
                <Dialog.Title className="t-title m-0 text-[length:var(--type-4)] text-[#f3f0ea] [@media(max-height:520px)]:text-[length:var(--type-3)]">{RELATED_COPY.title}</Dialog.Title>
                <Dialog.Description className="t-body m-0 text-[length:var(--type-1)] text-ink-muted [@media(max-height:520px)]:sr-only">
                  {RELATED_COPY.description}
                </Dialog.Description>
              </div>
            </div>
            <MemoryForm props={props} onLockChange={setLocked} onClose={() => setOpen(false)} />
            <Dialog.Close
              disabled={locked}
              data-magnetic="light"
              data-cursor-label="Cerrar"
              className="press absolute top-2 right-3 flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted disabled:opacity-40 md:top-5 md:right-6"
            >
              Cerrar
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
