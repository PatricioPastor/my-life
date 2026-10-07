"use client"

import { useId, useState } from "react"
import type { StackGroup } from "@/features/projects"
import type { Block } from "@/shared/content"
import { cn } from "@/shared/lib/utils"
import { GRID, GRID_ASIDE, GRID_CONTENT } from "@/shared/ui/grid"
import { NarrativeFont } from "./narrative-font"
import { PageBlock } from "./page-block"
import { PANEL_ATTRIBUTE, SectionIndex } from "./section-index"
import { sectionsOf } from "./sections"
import { useHeadlineProgress } from "./use-headline-progress"

/** The bar's backdrop: the place's void, ending in a short fade, so what scrolls beneath it fades out instead of being cut. */
const BACKDROP = "bg-[linear-gradient(to_bottom,var(--void)_calc(100%_-_1rem),transparent)]"

interface CaseStudyProps {
  meta: string
  title: string
  /** One sentence on the project: the text's headline. */
  summary?: string
  /** The full logo (a site path to an SVG) heading the case study in place of its title, which stays the heading's name. */
  logo?: string
  stack: readonly StackGroup[]
  blocks: readonly Block[]
}

/**
 * A case study on the place grid, in one panel that scrolls. The left zone (columns 1–2) holds still under the way back:
 * the logo (the page's heading), the meta and the stack, whose categories open onto their technologies. The content
 * zone (columns 3–6) opens on the summary as a large headline, then holds the whole text, every block in order, a
 * break drawn as a faint hairline: no pages, so nothing is ever laid on top of anything else. As the text scrolls, the
 * headline gives way to a compact line held at the top, beside the logo. From xl, the text takes columns 3–5 and the
 * index of its sections holds still in column 6. A phone reads one column: the logo, the meta, the headline, the text,
 * then the stack.
 */
export function CaseStudy({ meta, title, summary, logo, stack, blocks }: CaseStudyProps) {
  const id = useId()
  const titleId = `${id}-title`
  const { panel, headline, line } = useHeadlineProgress()
  const sections = sectionsOf(blocks)
  const anchors = new Map(sections.map((s) => [s.block, s.id]))
  // Indices of the open categories, and of every one opened so far: a category's isotypes are fetched when it first
  // opens, then stay, so that closing it can animate. Both copies of the stack (the left zone's, the phone's) read them.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set())
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (i: number) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })
    setOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)))
  }
  const list = { stack, open, opened, onToggle: toggle }

  return (
    // --case-top: where the content starts, right under the way back's row; the compact line holds there too.
    // --case-anchor: where a section's heading lands after a jump, and where the index holds: under the compact line.
    // Isolated, so the bar over the text stays under the way back, which is drawn above the panel.
    <div
      ref={panel}
      {...{ [PANEL_ATTRIBUTE]: "" }}
      className="absolute inset-0 isolate overflow-y-auto overscroll-contain [--case-anchor:calc(var(--case-top)+2rem+var(--space-3))] [--case-top:calc(var(--bar-top)+var(--bar-row)+var(--bar-gap))]"
    >
      <NarrativeFont />
      {/* One cell holds the text and the bar it scrolls beneath. */}
      <div className="grid min-h-full">
        <article
          aria-labelledby={titleId}
          className={cn(
            "relative flex flex-col gap-10 pt-(--case-top) pr-(--grid-right) pb-[calc(var(--space-12)+env(safe-area-inset-bottom))] pl-(--grid-left) [grid-area:1/1]",
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
              "rise md:sticky md:top-(--case-top) md:-mr-2 md:-ml-4 md:max-h-[calc(100svh-var(--case-top))] md:self-start md:overflow-y-auto md:pr-2 md:pb-2 md:pl-4 [@media(max-height:520px)]:static [@media(max-height:520px)]:max-h-none",
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
          {/* The content zone: from xl, its own four columns, lined up with the grid's 3–6. */}
          <div className={cn(GRID_CONTENT, "rise-late flex flex-col xl:grid xl:grid-cols-4 xl:gap-x-(--grid-gap)")}>
            <div className="flex flex-col xl:col-span-3">
              {/* The summary, as the text's headline (the logo stays the page's heading). It keeps its place in the
                  text as it gives way to the compact line: only its transform and opacity change (globals.css). */}
              {summary && (
                <h2
                  ref={headline}
                  className="case-headline m-0 mb-10 font-narrative text-[clamp(36px,calc(36px+(100vw-390px)*0.019),56px)] leading-[1.04] font-medium tracking-[-0.025em] text-balance text-ink"
                >
                  {summary}
                </h2>
              )}
              {/* The text scrolls with the panel; focusable and named, so the keyboard can scroll it too. A jump from the
                  index lands a section's heading under the bar, and focuses it. */}
              <div
                role="region"
                aria-labelledby={titleId}
                tabIndex={0}
                className="flex max-w-[66ch] flex-col gap-5 font-narrative text-[17px] leading-[1.6] text-ink focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-ink-faint md:text-[18px] [@media(max-height:520px)]:text-[16px] [&_strong]:font-semibold [&>h2]:mt-1 [&>h2]:scroll-mt-(--case-anchor) [&>h2]:focus-visible:outline-1 [&>h2]:focus-visible:outline-offset-8 [&>h2]:focus-visible:outline-ink-faint"
              >
                {blocks.map((block, i) =>
                  block.type === "break" ? (
                    // A section ends: space, and a faint hairline across the text's measure.
                    <hr key={i} className="my-5 h-px border-0 bg-ink-faint/40" />
                  ) : (
                    <PageBlock key={i} block={block} id={anchors.get(i)} />
                  ),
                )}
              </div>
            </div>
            {/* Only where the sixth column is wide enough to hold a title on a line or two. */}
            {sections.length > 0 && (
              <SectionIndex sections={sections} className="hidden xl:sticky xl:top-(--case-anchor) xl:col-start-4 xl:block xl:self-start" />
            )}
          </div>
          <StackList {...list} idPrefix={`${id}-end`} className="rise-late md:hidden" />
        </article>
        {/* The bar the text scrolls beneath, held at the top of the panel. The way back's row is always covered, across
            the panel, the text fading out just above where it starts, so it never shows under the label. In the content
            zone (the whole column on a phone), the headline's compact line comes in under that row, on a backdrop that
            reaches up over it, so nothing shows between the two. */}
        <div className="pointer-events-none sticky top-0 z-10 h-0 self-start [grid-area:1/1]">
          <div className={cn(BACKDROP, "absolute inset-x-0 top-0 h-(--case-top)")} />
          {summary && (
            <div className={cn("pr-(--grid-right) pl-(--grid-left)", GRID)}>
              <div className={cn(GRID_CONTENT, "relative")}>
                <div
                  className={cn(
                    BACKDROP,
                    "case-bar absolute top-0 right-[calc(var(--grid-right)*-1)] left-[calc(var(--grid-left)*-1)] h-[calc(var(--case-top)+3rem)] md:left-[calc(var(--grid-gap)*-1)]",
                  )}
                />
                {/* The headline's words again: decoration, since the headline stays the heading. */}
                <p
                  ref={line}
                  aria-hidden="true"
                  className="case-line absolute inset-x-0 top-(--case-top) m-0 h-8 truncate font-narrative text-[15px] leading-8 font-medium text-ink"
                >
                  {summary}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StackListProps {
  stack: readonly StackGroup[]
  /** The open categories, by index. */
  open: ReadonlySet<number>
  /** Every category opened so far, by index: only these hold their technologies (and fetch their isotypes). */
  opened: ReadonlySet<number>
  onToggle: (index: number) => void
  /** Ids for this copy of the stack: the left zone and the phone each render one, and only one shows. */
  idPrefix: string
  className?: string
}

/** The stack: its label, then one disclosure per category, in the order the case study gives them. */
function StackList({ stack, open, opened, onToggle, idPrefix, className }: StackListProps) {
  const labelId = `${idPrefix}-label`
  return (
    <section className={className}>
      <h2 id={labelId} className="m-0 text-xs font-normal tracking-[0.06em] text-ink-muted">
        Stack
      </h2>
      <ul aria-labelledby={labelId} className="m-0 mt-2 flex list-none flex-col p-0">
        {stack.map((group, i) => (
          <li key={i}>
            <StackCategory group={group} id={`${idPrefix}-${i}`} open={open.has(i)} mounted={opened.has(i)} onToggle={() => onToggle(i)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface StackCategoryProps {
  group: StackGroup
  id: string
  open: boolean
  /** Whether it has ever been opened: until then it holds no technologies, so no isotype is fetched. */
  mounted: boolean
  onToggle: () => void
}

/**
 * A category of the stack: its name, a button that opens its technologies under it as chips, each its isotype (when
 * there is one) and its name. Closed, it is its name alone. The square in the margin (the list rows' mark) shows on
 * hover and focus, and stays while it is open. The name in a chip says what it is, so the isotype is decoration.
 */
function StackCategory({ group, id, open, mounted, onToggle }: StackCategoryProps) {
  const nameId = `${id}-name`
  const panelId = `${id}-items`
  return (
    <>
      <button
        id={nameId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        data-magnetic="light"
        className="row press relative flex min-h-9 w-full items-center text-left text-xs tracking-[0.06em] text-ink"
      >
        <span aria-hidden="true" className="mark absolute top-1/2 -left-4 size-2 -translate-y-1/2 bg-signal" />
        {group.name}
      </button>
      {/* Grows from no height (globals.css, .tech-reveal); each isotype keeps a fixed height, so the size is known
          before it loads. */}
      <div id={panelId} data-open={open} className="tech-reveal">
        <div className="min-h-0 overflow-hidden">
          {mounted && (
            <div className="pt-1 pb-3">
              <ul aria-labelledby={nameId} className="m-0 flex list-none flex-wrap gap-2 p-0">
                {group.items.map((tech, j) => (
                  <li key={j} className="flex h-8 items-center gap-2 border border-ink-faint/40 px-2.5 text-xs tracking-[0.06em] text-ink">
                    {tech.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tech.icon} alt="" draggable={false} decoding="async" className="block h-5 w-auto shrink-0" />
                    )}
                    {tech.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
