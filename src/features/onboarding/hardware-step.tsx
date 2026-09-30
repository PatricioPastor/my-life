"use client"

import { useEffect, useMemo } from "react"
import { track } from "@/shared/analytics"
import { warmUpSky } from "@/features/sky/warm-up"
import { classifyRenderer, instructionsFor } from "./gpu"

interface HardwareStepProps {
  onEnter: () => void
}

/** Last step: says whether the browser already accelerates WebGL, or how to turn it on. */
export function HardwareStep({ onEnter }: HardwareStepProps) {
  const verdict = useMemo(() => classifyRenderer(warmUpSky()), [])
  const instructions = useMemo(() => instructionsFor(navigator.userAgent), [])
  const needsToggle = verdict !== "hardware" && instructions.browser !== "safari"

  useEffect(() => {
    if (needsToggle) track("hw_accel_suggested")
  }, [needsToggle])

  return (
    <div className="ob-hw font-gambarino">
      {needsToggle ? (
        <>
          <p className="ob-hw-line">Para verlo como fue pensado, activa la aceleración por hardware de tu navegador.</p>
          <ol className="ob-hw-steps">
            {instructions.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      ) : (
        <p className="ob-hw-line ob-hw-ok">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          Tu navegador ya usa aceleración por hardware.
        </p>
      )}
      <button
        type="button"
        className="ob-continue press"
        data-magnetic="light"
        data-cursor-label="Entrar"
        onClick={onEnter}
      >
        Entrar
      </button>
    </div>
  )
}
