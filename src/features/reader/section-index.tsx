"use client"

import { type MouseEvent, useEffect, useId, useRef, useState } from "react"
import type { Section } from "./sections"

const REDUCED = "(prefers-reduced-motion: reduce)"
/** How far below where a jump lands a heading (its scroll margin, under the bar) the line it rises past to become current lies. */
const LINE = 48
/** How far above the panel the watched area reaches: past any heading, however far the text has scrolled. */
const ABOVE = 100_000

/** The case study's panel: the box that scrolls, and the root the headings are watched in. */
export const PANEL_ATTRIBUTE = "data-case-panel"

const panelOf = (el: Element | null) => el?.closest<HTMLElement>(`[${PANEL_ATTRIBUTE}]`) ?? null

/**
 * A section's heading, looked for within its own panel, never the whole document: the ids are readable slugs, so
 * another case study on the page at the same time may use the same ones.
 */
const headingIn = (panel: HTMLElement, id: string) => panel.querySelector<HTMLElement>(`#${CSS.escape(id)}`)

/**
 * The index of a case study's sections, held beside the text as it scrolls. Each entry jumps to its section: the panel
 * scrolls to it (at once under reduced motion), its heading landing under the bar, and focus moves to that heading
 * without a second scroll. The section being read is marked (`aria-current="location"`): the last whose heading has risen
 * past a line just under where a jump lands one, or, once the panel can scroll no further, the last section, whose heading
 * may never rise that far. Nothing is marked in the intro, before the first section. A chosen entry stays marked while the
 * panel travels to it, until the reader scrolls on their own. Without IntersectionObserver, nothing is marked.
 */
export function SectionIndex({ sections, className }: { sections: readonly Section[]; className?: string }) {
  const labelId = useId()
  const nav = useRef<HTMLElement>(null)
  // The entry last chosen, held while the panel travels to it.
  const chosen = useRef<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  // The ids alone, as one string: the watch below restarts only when the sections do.
  const ids = sections.map((s) => s.id).join(" ")

  useEffect(() => {
    const root = panelOf(nav.current)
    if (!root || typeof IntersectionObserver === "undefined") return
    const order = ids.split(" ")
    const headings = order.map((id) => headingIn(root, id)).filter((h): h is HTMLElement => h !== null)
    const risen = new Set<string>()
    let atEnd = false
    const update = () => {
      const reached = order.findLast((id) => risen.has(id)) ?? null
      setCurrent(chosen.current ?? (atEnd ? (order.at(-1) ?? null) : reached))
    }
    // The watched area is everything above the line, however far: a heading in it has risen past the line. A heading
    // that leaps past it in one jump (a key, a dragged scrollbar, a jump at once) still crosses that area's edge, where
    // one watched only below the line would see it go from out of view to out of view, and never report it. The line
    // is measured from the panel's top, so the area is rebuilt when the panel changes size, whether the window resized
    // or only the panel did (a ResizeObserver on it, where there is one, besides the window's resize), and only when
    // the line has moved.
    let observer: IntersectionObserver | null = null
    let margin = ""
    const watch = () => {
      const line = (headings[0] ? parseFloat(getComputedStyle(headings[0]).scrollMarginTop) || 0 : 0) + LINE
      const next = `${ABOVE}px 0px ${Math.round(line - root.clientHeight)}px 0px`
      if (observer && next === margin) return
      observer?.disconnect()
      margin = next
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) risen.add(entry.target.id)
            else risen.delete(entry.target.id)
          }
          update()
        },
        { root, rootMargin: margin },
      )
      for (const heading of headings) observer.observe(heading)
    }
    watch()
    const resizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(watch)
    resizes?.observe(root)
    const onScroll = () => {
      const end = root.scrollHeight > root.clientHeight && root.scrollTop + root.clientHeight >= root.scrollHeight - 2
      if (end === atEnd) return
      atEnd = end
      update()
    }
    // The reader taking over: their own scrolling lets the chosen entry go.
    const release = () => {
      if (chosen.current === null) return
      chosen.current = null
      update()
    }
    const takeovers = ["wheel", "touchstart", "keydown", "pointerdown"] as const
    root.addEventListener("scroll", onScroll, { passive: true })
    for (const type of takeovers) root.addEventListener(type, release, { passive: true })
    window.addEventListener("resize", watch)
    return () => {
      observer?.disconnect()
      resizes?.disconnect()
      root.removeEventListener("scroll", onScroll)
      for (const type of takeovers) root.removeEventListener(type, release)
      window.removeEventListener("resize", watch)
    }
  }, [ids])

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const root = panelOf(nav.current)
    const heading = root && headingIn(root, id)
    if (!root || !heading) return
    event.preventDefault()
    const margin = parseFloat(getComputedStyle(heading).scrollMarginTop) || 0
    const top = heading.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - margin
    const reduced = typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches
    root.scrollTo({ top, behavior: reduced ? "auto" : "smooth" })
    heading.focus({ preventScroll: true })
    chosen.current = id
    setCurrent(id)
  }

  return (
    <nav ref={nav} aria-labelledby={labelId} className={className}>
      <p id={labelId} className="m-0 text-xs tracking-[0.06em] text-ink-muted">
        Índice
      </p>
      <ol className="m-0 mt-2 list-none p-0">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id ? "location" : undefined}
              onClick={(event) => jump(event, section.id)}
              data-magnetic="light"
              className="row relative block py-1.5 font-narrative text-[14px] leading-[1.35] text-ink-muted transition-colors duration-200 ease-out hover:text-ink aria-[current=location]:text-ink"
            >
              {/* The list rows' square, in the margin: on hover and focus, and on the current section. */}
              <span aria-hidden="true" className="mark absolute top-[calc(0.375rem+0.675em)] -left-4 size-2 -translate-y-1/2 bg-signal" />
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
