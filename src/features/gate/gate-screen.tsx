"use client"

import type { FormEvent } from "react"
import type { SkyPresetName } from "@/features/sky"
import { cn } from "@/shared/lib/utils"
import { AsciiTunnel } from "./ascii-tunnel"
import type { GateState, GateStatus } from "./gate-machine"

interface GateScreenProps {
  state: GateState
  preset?: SkyPresetName
  onTyped: (raw: string) => void
  onSubmit: () => void
  onRequestInvite: () => void
}

const SHADOW = "[text-shadow:0_1px_10px_rgba(0,0,0,0.9)]"

function statusText(status: GateStatus, handle: string): string {
  switch (status) {
    case "idle":
      return "Invitation only."
    case "invalid":
      return "Use letters, numbers, periods or underscores."
    case "checking":
      return "Checking the list…"
    case "denied":
      return `@${handle} isn’t on the list yet.`
    case "requested":
      return "Request sent."
    case "granted":
      return ""
  }
}

export function GateScreen({ state, preset, onTyped, onSubmit, onRequestInvite }: GateScreenProps) {
  const { status, handle } = state
  const refused = status === "invalid" || status === "denied"

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <div className="absolute inset-0">
      <AsciiTunnel gate={status} preset={preset} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[70%] left-1/2 h-[460px] w-[min(760px,100%)] -translate-x-1/2 -translate-y-1/2"
        style={{ background: "radial-gradient(closest-side, var(--scrim), transparent)" }}
      />
      <p className={cn("absolute top-10 left-12 m-0 text-xs tracking-[0.12em] text-ink-muted", SHADOW)}>
        [Your name]
      </p>
      <div className="absolute inset-x-0 top-[58%] flex flex-col items-center px-6">
        {status !== "granted" ? (
          <form onSubmit={submit} className="rise flex max-w-full flex-col items-center gap-[18px]">
            <label htmlFor="ig-handle" className="text-xs tracking-[0.08em] text-ink-muted">
              Enter with your Instagram
            </label>
            <div
              className={cn(
                "field relative flex w-[520px] max-w-full items-center gap-[14px] border-b border-ink-faint pb-[10px]",
                refused && "shake",
              )}
            >
              <span aria-hidden="true" className="font-display text-[44px] leading-none font-black text-signal">
                @
              </span>
              <input
                id="ig-handle"
                name="handle"
                type="text"
                value={handle}
                onChange={(e) => onTyped(e.target.value)}
                placeholder="username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={30}
                disabled={status === "checking"}
                aria-describedby="gate-status"
                className="h-14 min-w-0 grow border-0 bg-transparent p-0 font-display text-[44px] leading-none font-black text-ink caret-signal outline-none"
              />
              <button
                type="submit"
                aria-label="Enter"
                disabled={!handle || status === "checking"}
                className="press flex h-14 w-14 shrink-0 items-center justify-center border border-signal text-ink"
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
              {statusText(status, handle)}
            </p>
            {status === "denied" && (
              <button
                type="button"
                onClick={onRequestInvite}
                className="press h-11 border border-ink-faint px-[18px] text-xs tracking-[0.08em] text-ink"
              >
                Ask for an invite
              </button>
            )}
          </form>
        ) : (
          <div className="turn flex flex-col items-center gap-[14px]">
            <p className="m-0 text-xs tracking-[0.08em] text-ink-muted">Welcome</p>
            <p className="m-0 max-w-full font-display text-[64px] leading-none font-black break-all text-ink">
              @{handle}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
