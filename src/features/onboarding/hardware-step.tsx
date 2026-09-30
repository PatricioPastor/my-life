"use client"

import { useEffect, useMemo, useState } from "react"
import { track } from "@/shared/analytics"
import { classifyRenderer, instructionsFor, type RendererClass } from "./gpu"
import { probeRenderer } from "./gpu-probe"
import { whenIdle } from "./idle"

interface HardwareStepProps {
  onEnter: () => void
}

/** Last step: says whether the browser already accelerates WebGL, or how to turn it on. */
export function HardwareStep({ onEnter }: HardwareStepProps) {
  const [verdict, setVerdict] = useState<RendererClass | null>(null)
  const instructions = useMemo(() => instructionsFor(navigator.userAgent), [])
  // Safari has no toggle, so there is nothing to suggest there.
  const shown: RendererClass | null = instructions.browser === "safari" && verdict ? "hardware" : verdict

  // The probe runs off the render path (it usually finds its answer cached by the story-phase warm-up).
  useEffect(() => whenIdle(() => setVerdict(classifyRenderer(probeRenderer())), 200), [])

  useEffect(() => {
    if (shown === "software") track("hw_accel_suggested")
  }, [shown])

  const steps = (
    <ol className="ob-hw-steps">
      {instructions.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  )

  return (
    <div className="ob-hw font-gambarino">
      {shown === "software" && (
        <>
          <p className="ob-hw-line">Para verlo como fue pensado, activa la aceleración por hardware de tu navegador.</p>
          {steps}
        </>
      )}
      {shown === "unknown" && (
        <>
          <p className="ob-hw-line ob-hw-soft">
            Si notas tirones, revisa que la aceleración por hardware de tu navegador esté activa.
          </p>
          <details className="ob-hw-how">
            <summary>Cómo</summary>
            {steps}
          </details>
        </>
      )}
      {shown === "hardware" && (
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
