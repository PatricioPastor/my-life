import { Fragment, memo, useMemo, type ReactNode } from "react"
import type { Block, InlineRun } from "@/shared/content"
import { tokenizeRuns } from "./words"

interface ReaderBlockProps {
  block: Block
  /** Words painted so far. Whole paragraphs that were read or not yet reached pass a steady number, so they never re-render. */
  painted: number
  /** Every word filled from the start (reduced motion). */
  fill: boolean
  active: boolean
  /** The visitor completed this paragraph by hand: its remaining words fill in quickly instead of at reading pace. */
  rush: boolean
  blockRef: (el: HTMLElement | null) => void
}

function Words({ runs, painted, fill }: { runs: readonly InlineRun[]; painted: number; fill: boolean }) {
  const { segments } = useMemo(() => tokenizeRuns(runs), [runs])
  return (
    <>
      {runs.map((run, r) => {
        const inner: ReactNode[] = segments
          .filter((s) => s.run === r)
          .map((s, i) =>
            s.kind === "space" ? (
              s.text
            ) : (
              // data-t feeds the outline layer (::before): it fades out as the fill fades in, so a word never blinks out between them.
              <span key={i} className="rd-w" data-t={s.text} data-p={fill || s.word! < painted ? "true" : undefined}>
                {s.text}
              </span>
            ),
          )
        if (run.kind === "em") return <em key={r}>{inner}</em>
        if (run.kind === "strong") return <strong key={r}>{inner}</strong>
        return <Fragment key={r}>{inner}</Fragment>
      })}
    </>
  )
}

/**
 * One block of the story. Text blocks are split into word spans so painting is a class flip per word; the text stays whole
 * and in order in the DOM, so a screen reader reads it as plain text. React text nodes only: nothing is parsed as HTML.
 */
export const ReaderBlock = memo(function ReaderBlock({ block, painted, fill, active, rush, blockRef }: ReaderBlockProps) {
  switch (block.type) {
    case "paragraph":
      return (
        <p ref={blockRef} className="rd-block t-body" aria-current={active ? "true" : undefined} data-rush={rush ? "true" : undefined}>
          <Words runs={block.runs} painted={painted} fill={fill} />
        </p>
      )
    case "quote":
      return (
        <blockquote ref={blockRef} className="rd-block rd-quote t-body" aria-current={active ? "true" : undefined} data-rush={rush ? "true" : undefined}>
          <Words runs={block.runs} painted={painted} fill={fill} />
        </blockquote>
      )
    case "subheading":
      return (
        <h3 ref={blockRef} className="rd-block rd-sub t-title">
          {block.text}
        </h3>
      )
    case "break":
      return <hr ref={blockRef} className="rd-block rd-break" />
  }
})
