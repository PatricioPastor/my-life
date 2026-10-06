import { Fragment } from "react"
import type { Block, InlineRun } from "@/shared/content"

function Runs({ runs }: { runs: readonly InlineRun[] }) {
  return runs.map((run, i) => {
    if (run.kind === "em") return <em key={i}>{run.text}</em>
    // Spectral ships only its 400 (layout.tsx): strong keeps it, as in the intro reader, and takes the full ink.
    if (run.kind === "strong") return <strong key={i} className="font-normal text-ink">{run.text}</strong>
    return <Fragment key={i}>{run.text}</Fragment>
  })
}

/**
 * One block of an entry's page, at rest: the intro reader's ReaderBlock paints word by word on an animated stack, which
 * a page that turns has no use for. React text nodes only: nothing is parsed as HTML.
 */
export function PageBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="m-0">
          <Runs runs={block.runs} />
        </p>
      )
    case "quote":
      return (
        <blockquote className="m-0 border-l border-ink-faint pl-5 text-ink-muted">
          <Runs runs={block.runs} />
        </blockquote>
      )
    case "subheading":
      return <h2 className="m-0 font-sans text-xs font-normal tracking-[0.06em] text-ink-muted">{block.text}</h2>
    case "break":
      // Breaks are where pages turn (pagesOf), so a page never holds one.
      return null
  }
}
