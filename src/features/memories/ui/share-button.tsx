"use client"

import { useEffect, useRef, useState } from "react"
import { track } from "@/shared/analytics"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"

interface ShareButtonProps {
  memory: MemoryView
  /** Asks for the absolute link of a memory: the server action for a visitor, the link they hold for a guest. */
  share: (id: string) => Promise<ShareMemoryResult>
}

/** How long "Enlace copiado" stays: long enough to read, short enough to be gone before the next thing. */
const MESSAGE_MS = 2000
const COPY = {
  copied: "Enlace copiado",
  noLink: "No pudimos crear el enlace",
  noCopy: "No pudimos copiar el enlace",
} as const
const SHARE_TEXT = "Un recuerdo de patriciopastor"

/** A phone-like device: the system share sheet is the right way there, a copied link the right way on a desktop. */
function prefersShareSheet(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError"

async function copy(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

/**
 * "Compartir", for an approved memory only (a pending one has no link). It asks for the link, then opens the system
 * share sheet on a phone, or copies the link on a desktop (or when the sheet is not there or fails), saying so quietly.
 * Cancelling the sheet is not an error and says nothing. The server builds the link; this only passes it on.
 */
export function ShareButton({ memory, share }: ShareButtonProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressed = useRef(false)

  useEffect(() => () => clearTimeout(timer.current), [])

  if (memory.status !== "approved") return null

  const say = (text: string) => {
    clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(""), MESSAGE_MS)
  }

  const onClick = async () => {
    // A second press while the first is still being answered would ask twice.
    if (pressed.current) return
    pressed.current = true
    setBusy(true)
    try {
      let result: ShareMemoryResult
      try {
        result = await share(memory.id)
      } catch {
        result = { ok: false, reason: "unavailable" }
      }
      if (!result.ok) return say(COPY.noLink)

      if (prefersShareSheet()) {
        try {
          await navigator.share({ title: memory.caption, text: SHARE_TEXT, url: result.url })
          track("memory_shared")
          return
        } catch (error) {
          if (isAbort(error)) return
          // The sheet could not open (no longer a user gesture, no targets): the link is copied instead.
        }
      }
      if (await copy(result.url)) {
        track("memory_shared")
        say(COPY.copied)
      } else {
        say(COPY.noCopy)
      }
    } finally {
      pressed.current = false
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-none relative flex items-center">
      <button
        type="button"
        aria-busy={busy || undefined}
        data-magnetic="light"
        data-cursor-label="Compartir"
        className="press pointer-events-auto flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
        onClick={onClick}
      >
        Compartir
      </button>
      {/* Always in the page, so a screen reader hears the change; empty when there is nothing to say. */}
      <span
        role="status"
        className="pointer-events-none absolute top-full right-3 -mt-1 text-[11px] tracking-[0.06em] whitespace-nowrap text-ink-faint"
      >
        {message}
      </span>
    </div>
  )
}
