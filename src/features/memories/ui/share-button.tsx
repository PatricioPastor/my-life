"use client"

import { useEffect, useRef, useState } from "react"
import { track } from "@/shared/analytics"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"
import { createShareCache, type ShareCache } from "./share-cache"

interface ShareButtonProps {
  memory: MemoryView
  /** Asks for the absolute link of a memory: the server action for a visitor, the link they hold for a guest. */
  share: (id: string) => Promise<ShareMemoryResult>
  /** The links asked for so far, kept by the glass for the whole session. Without it the button keeps its own. */
  cache?: ShareCache
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
export function ShareButton({ memory, share, cache }: ShareButtonProps) {
  const [own] = useState(() => cache ?? createShareCache(share))
  const links = cache ?? own
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressed = useRef(false)

  useEffect(() => () => clearTimeout(timer.current), [])

  // The link is asked for as soon as the button is there, so the click does not have to wait for the server.
  const { id, status } = memory
  useEffect(() => {
    if (status === "approved") links.prefetch(id)
  }, [links, id, status])

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
      // With the link in hand nothing is awaited before the sheet opens, so the click's user gesture is still valid
      // (iOS Safari refuses the sheet otherwise). Without it, the link is awaited and the copy flow takes over.
      const cached = links.peek(memory.id)
      const result = cached ?? (await links.get(memory.id))
      if (!result.ok) return say(COPY.noLink)

      // A link that had to be awaited has lost the gesture: the sheet would be refused, so it is copied.
      if (cached && prefersShareSheet()) {
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
