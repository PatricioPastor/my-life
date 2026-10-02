"use client"

import type { CSSProperties } from "react"
import { effectiveVolume, volumeText, type VolumePref } from "./player-model"

interface VolumeControlProps {
  pref: VolumePref
  onChange: (pref: VolumePref) => void
}

type RangeStyle = CSSProperties & { "--fill": string }

/** Coming back from a slider dragged to zero: a middle volume, rather than another silence. */
const UNMUTED_FALLBACK = 0.5

const SpeakerIcon = ({ level }: { level: "off" | "low" | "high" }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M3 7h2.6L9.5 3.8v10.4L5.6 11H3z" fill="currentColor" />
    {level === "off" ? (
      <path d="M12.5 7l3.5 4M16 7l-3.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    ) : (
      <>
        <path d="M12 7.2a2.8 2.8 0 0 1 0 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        {level === "high" && <path d="M13.8 5.2a5.6 5.6 0 0 1 0 7.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
      </>
    )}
  </svg>
)

/**
 * The volume of the voice: a mute button and a slider. The button says whether it is pressed; the slider reads as a
 * percentage ("70 %") or "Silenciado". Both are 44 px targets.
 */
export function VolumeControl({ pref, onChange }: VolumeControlProps) {
  const level = effectiveVolume(pref)
  const toggleMute = () => {
    if (pref.muted) onChange({ ...pref, muted: false })
    else if (pref.volume === 0) onChange({ volume: UNMUTED_FALLBACK, muted: false })
    else onChange({ ...pref, muted: true })
  }
  return (
    <>
      <button
        type="button"
        aria-label="Silenciar"
        aria-pressed={level === 0}
        data-magnetic="light"
        data-cursor-label="Silenciar"
        className="mem-glass-ctl press pointer-events-auto flex size-11 shrink-0 items-center justify-center text-ink-muted"
        onClick={toggleMute}
      >
        <SpeakerIcon level={level === 0 ? "off" : level < 0.5 ? "low" : "high"} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(level * 100)}
        aria-label="Volumen"
        aria-valuetext={volumeText(pref)}
        data-glass-volume
        className="mem-range w-16 shrink-0 max-[380px]:w-12"
        style={{ "--fill": `${Math.round(level * 100)}%` } as RangeStyle}
        onChange={(event) => onChange({ volume: Number(event.currentTarget.value) / 100, muted: false })}
      />
    </>
  )
}
