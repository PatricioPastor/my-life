"use client"

import type { FormEvent } from "react"
import { rgba } from "@/shared/lib/color"
import { useKeyboardInset } from "@/shared/lib/use-keyboard-inset"
import { cn } from "@/shared/lib/utils"
import { OWNER_HANDLE, buildAccessRequest, copyToClipboard } from "./access/access-request"
import { AsciiTunnel } from "./ascii-tunnel"
import type { GateState, GateStatus } from "./gate-machine"
import { PORTAL } from "./portal-palette"

interface GateScreenProps {
  state: GateState
  onTyped: (raw: string) => void
  onSubmit: () => void
  onRequestInvite: (copied: boolean) => void
}

const SHADOW = "[text-shadow:0_1px_10px_rgba(0,0,0,0.9)]"

function statusText(status: GateStatus, handle: string, copied?: boolean): string {
  switch (status) {
    case "idle":
      return "Solo con invitación."
    case "invalid":
      return "Usa letras, números, puntos o guiones bajos."
    case "checking":
      return "Revisando la lista…"
    case "denied":
      return `@${handle} todavía no está en la lista.`
    case "requested":
      return copied
        ? `Mensaje copiado. Pégalo en el DM a @${OWNER_HANDLE}.`
        : `Envía un DM a @${OWNER_HANDLE} desde @${handle}.`
    case "granted":
      return ""
  }
}

export function GateScreen({ state, onTyped, onSubmit, onRequestInvite }: GateScreenProps) {
  const { status, handle, copied } = state
  const refused = status === "invalid" || status === "denied"
  const request = buildAccessRequest(handle)
  // The keyboard covers the lower part of the page on a phone: the form rides just above it while it is open.
  const keyboard = useKeyboardInset()

  // The link navigates on its own; the copy is best effort and never blocks it.
  const askForAccess = () => {
    void copyToClipboard(request.message).then(onRequestInvite)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <div className="absolute inset-0">
      <AsciiTunnel gate={status} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[70%] left-1/2 h-[460px] w-[min(760px,100%)] -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(closest-side, ${rgba(PORTAL.deep, 0.88)}, transparent)` }}
      />
      <p className={cn("absolute top-[max(2.5rem,calc(env(safe-area-inset-top)+0.75rem))] left-12 m-0 text-xs tracking-[0.12em] text-ink-muted", SHADOW)}>
        patriciopastor
      </p>
      <div
        data-gate-form
        // Phones keep the form below the tunnel's ring, so the label and the field never sit on its glyphs.
        className="absolute inset-x-0 top-[58%] flex flex-col items-center px-6 max-sm:top-[68%]"
        style={keyboard > 0 ? { top: "auto", bottom: `${keyboard + 16}px` } : undefined}
      >
        {status !== "granted" ? (
          <form onSubmit={submit} className="rise flex max-w-full flex-col items-center gap-[18px]">
            <label htmlFor="ig-handle" className="text-xs tracking-[0.08em] text-ink-muted">
              Ingresa con tu Instagram
            </label>
            <div
              className={cn(
                "field relative flex w-[320px] max-w-full items-center gap-[10px] border-b border-ink-faint pb-2 sm:w-[520px] sm:gap-[14px] sm:pb-[10px]",
                refused && "shake",
              )}
            >
              <span aria-hidden="true" className="font-display text-[26px] leading-none font-black text-signal sm:text-[44px]">
                @
              </span>
              <input
                id="ig-handle"
                name="handle"
                type="text"
                value={handle}
                onChange={(e) => onTyped(e.target.value)}
                placeholder="usuario"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={30}
                disabled={status === "checking"}
                aria-describedby="gate-status"
                className="h-11 min-w-0 grow border-0 bg-transparent p-0 font-display text-[26px] leading-none font-black text-ink caret-signal outline-none sm:h-14 sm:text-[44px]"
              />
              <button
                type="submit"
                aria-label="Entrar"
                data-magnetic="light"
                data-cursor-label="Entrar"
                disabled={!handle || status === "checking"}
                className="press flex h-11 w-11 shrink-0 items-center justify-center border border-signal text-ink sm:h-14 sm:w-14"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                </svg>
              </button>
              <span
                aria-hidden="true"
                className="bar absolute right-0 -bottom-px left-0 h-px bg-signal"
              />
            </div>
            <p
              id="gate-status"
              role="status"
              className={cn("m-0 min-h-[18px] text-xs tracking-[0.06em]", refused ? "text-signal" : "text-ink-muted")}
            >
              {statusText(status, handle, copied)}
            </p>
            {(status === "denied" || status === "requested") && (
              <a
                href={request.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={askForAccess}
                data-magnetic="light"
                data-cursor-label="Pedir acceso"
                className="press inline-flex h-11 items-center border border-ink-faint px-[18px] text-xs tracking-[0.08em] text-ink"
              >
                Pedir acceso por Instagram
              </a>
            )}
          </form>
        ) : (
          <div className="turn flex flex-col items-center gap-[14px]">
            <p className="m-0 text-xs tracking-[0.08em] text-ink-muted">Hola</p>
            <p className="m-0 max-w-full font-display text-[36px] leading-none font-black break-all text-ink sm:text-[64px]">
              @{handle}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
