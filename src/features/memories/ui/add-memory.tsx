"use client"

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { Dialog } from "radix-ui"
import { track } from "@/shared/analytics"
import { cn } from "@/shared/lib/utils"
import { CAPTION_MAX_LENGTH, EARLIEST_MEMORY_DATE } from "../memory"
import type { MemoryView } from "../memory-view"
import { checkPhoto } from "../upload-limits"
import type { CreateMemoryInput, CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import type { UploadToCloudinary } from "./cloudinary-upload"
import { COPY, localToday, messageForFailure, validateForm, type FormErrors } from "./memory-form-model"

export interface AddMemoryProps {
  /** The element the dialog mounts into, so it stays inside the stage (and its cursor). */
  container: HTMLElement | null
  prepare: () => Promise<PrepareUploadResult>
  create: (input: CreateMemoryInput) => Promise<CreateMemoryResult>
  upload: UploadToCloudinary
  /** Called with the new, still pending memory as soon as it is saved. */
  onCreated: (memory: MemoryView) => void
  /** The visitor's local `YYYY-MM-DD` (a seam for tests). */
  today?: string
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
  const [date, setDate] = useState("")
  // Off by default: the visitor opts in to keeping an approximate place for this photo.
  const [shareLocation, setShareLocation] = useState(false)
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
    const check = checkPhoto(file)
    if (check !== "ok") {
      setPicked(null)
      setErrors((e) => ({ ...e, photo: check === "too_large" ? COPY.photoSize : COPY.photoType }))
      return
    }
    previewUrl.current = URL.createObjectURL(file)
    setPicked({ file, url: previewUrl.current })
    setErrors((e) => ({ ...e, photo: undefined }))
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
    const found = validateForm({ file: picked?.file ?? null, caption, date, today })
    if (found.photo || found.caption || found.date) {
      setErrors(found)
      return
    }
    setErrors({})
    const abort = new AbortController()
    controller.current = abort
    setPhase({ kind: "uploading", percent: 0 })
    try {
      const prepared = await props.prepare()
      if (abort.signal.aborted) return
      if (!prepared.ok) return fail(messageForFailure(prepared))

      const sent = await props.upload({
        file: picked!.file,
        grant: prepared.upload,
        onProgress: (percent) => setPhase((p) => (p.kind === "uploading" ? { kind: "uploading", percent } : p)),
        signal: abort.signal,
      })
      if (abort.signal.aborted || (!sent.ok && sent.reason === "cancelled")) return
      if (!sent.ok) return fail({ form: COPY.unavailable })

      setPhase({ kind: "saving" })
      onLockChange(true)
      const created = await props.create({
        ticket: prepared.upload.ticket,
        caption: caption.trim(),
        happenedOn: date,
        shareLocation,
      })
      if (abort.signal.aborted) return
      if (!created.ok) return fail(messageForFailure(created))

      track("memory_submitted")
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
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
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
            "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-dashed bg-white/[0.03] p-3 text-center transition-colors duration-200",
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
              className="max-h-44 max-w-full rounded-sm object-contain"
            />
          )}
          {picked ? (
            <span className="max-w-full truncate text-xs tracking-[0.06em] text-ink-muted">{picked.file.name}</span>
          ) : (
            <span className="t-body text-[length:var(--type-1)] text-ink-muted">
              Elige una foto
              <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline"> o arrástrala aquí</span>
            </span>
          )}
        </label>
        <p id="memory-photo-hint" className="m-0 text-xs tracking-[0.04em] text-ink-faint">
          JPG, PNG, WebP o HEIC, hasta 10 MB.
        </p>
        {errors.photo && (
          <p id="memory-photo-error" className={ERROR_CLASS}>
            {errors.photo}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="memory-caption" className={LABEL_CLASS}>
          ¿Qué recuerdas?
        </label>
        <textarea
          id="memory-caption"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={busy || phase.kind === "done"}
          aria-describedby={captionDescribedBy}
          aria-invalid={errors.caption ? true : undefined}
          className={cn(FIELD_CLASS, "t-body resize-none text-[length:var(--type-1)]")}
        />
        <div className="flex items-start justify-between gap-3">
          {errors.caption ? (
            <p id="memory-caption-error" className={ERROR_CLASS}>
              {errors.caption}
            </p>
          ) : (
            <span />
          )}
          <span id="memory-caption-count" className={cn("text-xs tabular-nums tracking-[0.04em]", count > CAPTION_MAX_LENGTH ? "text-signal" : "text-ink-faint")}>
            {count}/{CAPTION_MAX_LENGTH}
          </span>
        </div>
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="memory-location" className="flex cursor-pointer items-center gap-3 text-ink">
          <input
            id="memory-location"
            type="checkbox"
            checked={shareLocation}
            onChange={(e) => setShareLocation(e.target.checked)}
            disabled={busy || phase.kind === "done"}
            aria-describedby="memory-location-help"
            data-magnetic="light"
            data-cursor-label="Guardar ubicación"
            className="h-4 w-4 shrink-0 cursor-pointer accent-[#a8c8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
          />
          <span className="t-body text-[length:var(--type-1)]">Guardar desde dónde fue</span>
        </label>
        <p id="memory-location-help" className="m-0 pl-7 text-xs tracking-[0.04em] text-ink-faint">
          Solo guardamos una ubicación aproximada (unos 1 km), nunca la exacta.
        </p>
      </div>

      {errors.form && (
        <p id="memory-form-error" role="alert" className={ERROR_CLASS}>
          {errors.form}
        </p>
      )}
      <p role="status" className="t-body m-0 text-[length:var(--type-1)] text-ink empty:hidden">
        {phase.kind === "done" ? "Listo. Tu recuerdo quedó pendiente de aprobación." : ""}
      </p>

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
    </form>
  )
}

/**
 * The "Agregar recuerdo" control and the dialog it opens: a photo, a few words and a date. The dialog is part of
 * the dark dimension (a translucent panel with a fine cool rim), mounted inside the stage like the viewer.
 */
export function AddMemory(props: AddMemoryProps) {
  const [open, setOpen] = useState(false)
  const [locked, setLocked] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next || !locked) && setOpen(next)}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-magnetic="light"
          data-cursor-label="Agregar recuerdo"
          className="press t-label flex h-10 items-center gap-2.5 rounded-full md:h-11 border border-[#a8c8ff]/35 bg-[#07061a]/70 px-5 text-[#e6edff] shadow-[0_0_28px_rgba(140,170,255,0.14)] backdrop-blur-sm transition-colors duration-200 hover:border-[#a8c8ff]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          Agregar recuerdo
        </button>
      </Dialog.Trigger>
      <Dialog.Portal container={props.container}>
        <Dialog.Overlay className="mem-scrim absolute inset-0 bg-[#020207]/80" />
        <Dialog.Content
          className="mem-viewer absolute inset-0 flex items-center justify-center p-4 outline-none md:p-8"
          // The card is the only part that takes pointers: a press on the empty stage falls through to the scrim and closes.
          style={{ transformOrigin: "calc(100% - 120px) calc(100% - 90px)", pointerEvents: "none" }}
        >
          <div
            className={cn(
              RIM,
              "pointer-events-auto relative flex max-h-full w-full max-w-[460px] flex-col gap-5 overflow-y-auto rounded-md bg-[rgba(8,7,20,0.84)] p-6 shadow-[0_0_0_1px_rgba(168,200,255,0.06),0_28px_90px_rgba(0,0,0,0.65)] backdrop-blur-md md:p-8",
            )}
          >
            <div className="flex flex-col gap-2 pr-16">
              <Dialog.Title className="t-title m-0 text-[length:var(--type-4)] text-[#f3f0ea]">Agregar recuerdo</Dialog.Title>
              <Dialog.Description className="t-body m-0 text-[length:var(--type-1)] text-ink-muted">
                Tu recuerdo aparecerá en el espacio cuando sea aprobado.
              </Dialog.Description>
            </div>
            <MemoryForm props={props} onLockChange={setLocked} onClose={() => setOpen(false)} />
            <Dialog.Close
              disabled={locked}
              data-magnetic="light"
              data-cursor-label="Cerrar"
              className="press absolute top-4 right-4 flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted disabled:opacity-40"
            >
              Cerrar
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
