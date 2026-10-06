"use client"

import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from "react"
import { phraseTimeline, type PhraseKind } from "./phrases"

interface PhraseLineProps {
  kind: PhraseKind
  text: string
  active: boolean
  returning: boolean
  /** Lets a control name itself after the phrase (the choice's question labels its options). */
  id?: string
}

/**
 * One phrase, assembled letter by letter. Every letter is in its final place from the first frame (opacity 0), so nothing reflows;
 * the CSS keyframes only move transform, opacity and filter, driven by the per-letter custom properties.
 */
export function PhraseLine({ kind, text, active, returning, id }: PhraseLineProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const timeline = useMemo(() => phraseTimeline(kind, text, returning), [kind, text, returning])

  // `will-change` only while letters are moving: on for the entrance and the exit, off while the phrase rests.
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    const set = (on: boolean) => {
      el.dataset.animating = on ? "true" : "false"
    }
    set(true)
    const ids = [setTimeout(() => set(false), timeline.enterMs)]
    if (timeline.exitMs > 0) {
      ids.push(setTimeout(() => set(true), timeline.exitAtMs), setTimeout(() => set(false), timeline.totalMs))
    }
    return () => {
      ids.forEach(clearTimeout)
      set(false)
    }
  }, [active, timeline])

  // Word start offsets into the timeline (which counts spaces too).
  const words = text === "" ? [] : text.split(" ")
  const starts = words.map((_, w) => words.slice(0, w).reduce((n, x) => n + x.length + 1, 0))
  const style = { "--exit-at": `${timeline.exitAtMs}ms` } as CSSProperties

  return (
    <p
      ref={ref}
      id={id}
      className="ob-line t-title"
      data-on={active}
      data-exit={timeline.exitMs > 0 ? "true" : "false"}
      data-animating="false"
      aria-hidden={!active}
      style={style}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="ob-glyphs">
        {words.map((word, w) => (
          <Fragment key={w}>
            {w > 0 && " "}
            <span className="ob-word">
              {Array.from(word).map((char, c) => {
                const l = timeline.letters[starts[w]! + c]!
                return (
                  <span
                    key={c}
                    className="ob-letter"
                    style={
                      {
                        "--dx": `${l.dx}px`,
                        "--dy": `${l.dy}px`,
                        "--rot": `${l.rot}deg`,
                        "--scale": l.scale,
                        "--blur": `${l.blur}px`,
                        "--delay": `${l.delay}ms`,
                        "--dur": `${l.dur}ms`,
                        "--xy": `${l.xy}px`,
                        "--xdelay": `${l.xdelay}ms`,
                        "--xdur": `${l.xdur}ms`,
                      } as CSSProperties
                    }
                  >
                    {char}
                  </span>
                )
              })}
            </span>
          </Fragment>
        ))}
      </span>
    </p>
  )
}
