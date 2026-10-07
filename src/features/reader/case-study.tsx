"use client"

import { useId, useState } from "react"
import type { Block } from "@/shared/content"
import { cn } from "@/shared/lib/utils"
import { GRID, GRID_ASIDE, GRID_CONTENT } from "@/shared/ui/grid"
import { PageBlock } from "./page-block"

/** One technology of the stack: its name, and its official isotype (a site path) when there is one. */
export interface CaseStudyTech {
  name: string
  icon?: string
}

interface CaseStudyProps {
  meta: string
  title: string
  /** The full logo (a site path to an SVG) heading the case study in place of its title, which stays the heading's name. */
  logo?: string
  stack: readonly CaseStudyTech[]
  blocks: readonly Block[]
}

/**
 * A case study on the place grid, in one panel that scrolls. The left zone (columns 1–2) holds still under the way back:
 * the logo, the meta and the stack, whose items open onto each technology's isotype. The content zone (columns 3–6)
 * holds the whole text, every block in order, a break drawn as a faint hairline: no pages, so nothing is ever laid on
 * top of anything else. A phone reads one column: the logo, the meta, the text, then the stack.
 */
export function CaseStudy({ meta, title, logo, stack, blocks }: CaseStudyProps) {
  const id = useId()
  const titleId = `${id}-title`
  // Indices of the open items. Both copies of the list (the left zone's, the phone's) read the same ones.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })
  const list = { stack, open, onToggle: toggle }

  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain">
      {/* One cell holds the text and, on a phone, the fade under the way back that it scrolls beneath. */}
      <div className="grid min-h-full">
        <article
          aria-labelledby={titleId}
          className={cn(
            "relative flex flex-col gap-10 pt-[calc(var(--bar-top)+var(--bar-row)+var(--bar-gap))] pr-(--grid-right) pb-[calc(var(--space-12)+env(safe-area-inset-bottom))] pl-(--grid-left) [grid-area:1/1]",
            GRID,
          )}
        >
          {/* Under the way back, on the axis the place's label hangs from. It holds still while the text scrolls; past
              the screen's height (many items open) it scrolls on its own, and on a short landscape screen it does not
              hold at all. Its padding, cancelled by as much margin, keeps the marks in the margin and the focus rings
              clear of that scroll box's clip. */}
          <header
            className={cn(
              GRID_ASIDE,
              "rise md:sticky md:top-[calc(var(--bar-top)+var(--bar-row)+var(--bar-gap))] md:-mr-2 md:-ml-4 md:max-h-[calc(100svh-var(--bar-top)-var(--bar-row)-var(--bar-gap))] md:self-start md:overflow-y-auto md:pr-2 md:pb-2 md:pl-4 [@media(max-height:520px)]:static [@media(max-height:520px)]:max-h-none",
            )}
          >
            <h1 id={titleId} className="m-0 font-display text-[32px] leading-[0.95] font-black tracking-[-0.01em] break-words text-ink md:text-[40px]">
              {logo ? (
                // The full logo, a vector from public/ (next/image would serve it as is), never wider than its zone.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={title} draggable={false} className="block h-7 w-auto max-w-full object-contain object-left md:h-8" />
              ) : (
                title
              )}
            </h1>
            <p className="m-0 mt-3 text-xs leading-[1.6] tracking-[0.06em] text-ink-muted">{meta}</p>
            <StackList {...list} idPrefix={`${id}-side`} className="mt-10 max-md:hidden" />
          </header>
          {/* The text scrolls with the panel; focusable and named, so the keyboard can scroll it too. */}
          <div
            role="region"
            aria-labelledby={titleId}
            tabIndex={0}
            className={cn(
              GRID_CONTENT,
              "rise-late flex max-w-[68ch] flex-col gap-5 font-serif text-[21px] leading-[1.62] text-ink focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-ink-faint [@media(max-height:520px)]:text-[18px] [&>h2]:mt-1",
            )}
          >
            {blocks.map((block, i) =>
              block.type === "break" ? (
                // A section ends: space, and a faint hairline across the text's measure.
                <hr key={i} className="my-5 h-px border-0 bg-ink-faint/40" />
              ) : (
                <PageBlock key={i} block={block} />
              ),
            )}
          </div>
          <StackList {...list} idPrefix={`${id}-end`} className="rise-late md:hidden" />
        </article>
        {/* On a phone the text runs under the way back: it is covered behind the label and fades out just below it,
            instead of crossing it. */}
        <div aria-hidden="true" className="pointer-events-none sticky top-0 h-0 self-start [grid-area:1/1] md:hidden">
          <div className="absolute inset-x-0 top-0 h-[calc(var(--bar-top)+var(--bar-row)+var(--space-2))] bg-linear-to-b from-void from-65% to-transparent" />
        </div>
      </div>
    </div>
  )
}

interface StackListProps {
  stack: readonly CaseStudyTech[]
  open: ReadonlySet<number>
  onToggle: (index: number) => void
  /** Ids for this copy of the list: the left zone and the phone each render one, and only one shows. */
  idPrefix: string
  className?: string
}

/** The stack, one item per technology: a disclosure for each one with an isotype, plain text for any other. */
function StackList({ stack, open, onToggle, idPrefix, className }: StackListProps) {
  const labelId = `${idPrefix}-label`
  return (
    <section className={className}>
      <h2 id={labelId} className="m-0 text-xs font-normal tracking-[0.06em] text-ink-muted">
        Stack
      </h2>
      <ul aria-labelledby={labelId} className="m-0 mt-2 flex list-none flex-col p-0">
        {stack.map((tech, i) => (
          <li key={i}>
            {tech.icon ? (
              <TechItem name={tech.name} icon={tech.icon} id={`${idPrefix}-${i}`} open={open.has(i)} onToggle={() => onToggle(i)} />
            ) : (
              <span className="flex min-h-9 items-center text-xs tracking-[0.06em] text-ink">{tech.name}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * A technology's name, a button that opens its official isotype under it. The name says what it is, so the mark is
 * decoration. The square in the margin (the list rows' mark) shows on hover and focus, and stays while it is open.
 */
function TechItem({ name, icon, id, open, onToggle }: { name: string; icon: string; id: string; open: boolean; onToggle: () => void }) {
  const panelId = `${id}-icon`
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        data-magnetic="light"
        data-cursor-label={open ? "Ocultar isotipo" : "Ver isotipo"}
        className="row press relative flex min-h-9 w-full items-center text-left text-xs tracking-[0.06em] text-ink"
      >
        <span aria-hidden="true" className="mark absolute top-1/2 -left-4 size-2 -translate-y-1/2 bg-signal" />
        {name}
      </button>
      {/* Grows from no height (globals.css, .tech-reveal); the image keeps a fixed height, so the size is known before it loads. */}
      <div id={panelId} data-open={open} className="tech-reveal">
        <div className="min-h-0 overflow-hidden">
          <div className="pt-1 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="" draggable={false} decoding="async" className="block h-10 w-auto max-w-full" />
          </div>
        </div>
      </div>
    </>
  )
}
