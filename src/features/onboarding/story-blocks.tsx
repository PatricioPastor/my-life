import type { CSSProperties } from "react"
import type { Block, InlineRun } from "@/shared/content"

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        switch (run.kind) {
          case "em":
            return <em key={i}>{run.text}</em>
          case "strong":
            return <strong key={i}>{run.text}</strong>
          default:
            return run.text
        }
      })}
    </>
  )
}

/** Our own components for the typed blocks: React text nodes only, nothing is ever parsed as HTML. */
export function StoryBlocks({ blocks, delayMs }: { blocks: Block[]; delayMs: (index: number) => number }) {
  return (
    <>
      {blocks.map((block, i) => {
        const style = { animationDelay: `${delayMs(i)}ms` } as CSSProperties
        switch (block.type) {
          case "paragraph":
            return (
              <p key={i} style={style}>
                <Runs runs={block.runs} />
              </p>
            )
          case "quote":
            return (
              <blockquote key={i} className="ob-quote" style={style}>
                <Runs runs={block.runs} />
              </blockquote>
            )
          case "subheading":
            return (
              <h3 key={i} className="ob-subheading t-title" style={style}>
                {block.text}
              </h3>
            )
          case "break":
            return <hr key={i} className="ob-break" style={style} />
        }
      })}
    </>
  )
}
