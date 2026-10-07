import { Fragment, type ReactNode } from "react"
import { cn } from "@/shared/lib/utils"
import { PageBlock } from "./page-block"
import type { ReaderPage } from "./pages"

interface ReaderParagraph {
  text: string
  italic?: boolean
}

// Placeholder copy from the design canvas.
export const READER_PAGES: readonly (readonly ReaderParagraph[])[] = [
  [{ text: "[Párrafo inicial]" }, { text: "[Segundo párrafo]" }],
  [{ text: "[El texto continúa]" }, { text: "[Otro párrafo]" }],
  [{ text: "[Párrafo final]" }, { text: "[Firma]", italic: true }],
]

/** One of an entry's fields (a project's stack), set under its title. */
export interface ReaderDetail {
  label: string
  value: string
}

interface ReaderProps {
  meta: string
  title: string
  /** A logo (a site path to an SVG) shown in place of the title; the title stays the heading's name, as the logo's alt. */
  logo?: string
  details?: readonly ReaderDetail[]
  /** The entry's text cut into pages (pagesOf). Without it, the placeholder pages. */
  pages?: readonly ReaderPage[]
  page: number
  onPrev: () => void
  onNext: () => void
}

const CHEVRON_L = "M9 2L4 7l5 5"
const CHEVRON_R = "M5 2l5 5-5 5"

function Chevron({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

export function Reader({ meta, title, logo, details, pages, page, onPrev, onNext }: ReaderProps) {
  const contents: ReactNode[] = pages
    ? pages.map((blocks) => blocks.map((block, i) => <PageBlock key={i} block={block} />))
    : READER_PAGES.map((paragraphs) =>
        paragraphs.map((p) => (
          <p key={p.text} className={cn("m-0", p.italic && "text-ink-muted italic")}>
            {p.text}
          </p>
        )),
      )
  const count = contents.length
  const pageButton = "press flex size-12 items-center justify-center border border-ink-faint"

  return (
    <article className="rise-late pointer-events-auto flex my-auto w-[640px] max-w-full flex-col gap-7 [@media(max-height:520px)]:gap-4">
      <p className="m-0 text-xs tracking-[0.06em] text-ink-muted">{meta}</p>
      <h1 className="m-0 font-display text-[40px] leading-[0.95] font-black tracking-[-0.01em] text-ink md:text-[64px] [@media(max-height:520px)]:text-[28px]">
        {logo ? (
          // A vector from public/, sized in em so it follows the title's type at every breakpoint. It sits on the
          // title's baseline, inside the line a text title would fill, so nothing under the heading moves; next/image
          // would serve it as is.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={title} draggable={false} className="inline-block h-[0.6em] w-auto" />
        ) : (
          title
        )}
      </h1>
      {details && details.length > 0 && (
        <dl className="m-0 -mt-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-xs leading-[1.6] tracking-[0.06em] [@media(max-height:520px)]:mt-0">
          {details.map((d) => (
            <Fragment key={d.label}>
              <dt className="text-ink-muted">{d.label}</dt>
              <dd className="m-0 text-ink">{d.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {/* Pages turn in place: every page sits in one grid cell, so the area is as tall as the longest page (never less
          than the design's height) and the controls under it never move. Only the current page is seen and read. */}
      <div className="grid min-h-[272px] font-serif text-[21px] leading-[1.62] text-ink [@media(max-height:520px)]:min-h-[150px] [@media(max-height:520px)]:text-[18px]">
        {contents.map((content, i) =>
          i === page ? (
            <div key={`turn-${i}`} className="turn flex flex-col gap-5 [grid-area:1/1]">
              {content}
            </div>
          ) : (
            <div key={i} aria-hidden="true" className="invisible flex flex-col gap-5 [grid-area:1/1]">
              {content}
            </div>
          ),
        )}
      </div>
      <nav aria-label="Páginas" className="flex items-center justify-between">
        <button type="button" aria-label="Página anterior" data-magnetic="light" data-cursor-label="Página anterior" disabled={page === 0} onClick={onPrev} className={pageButton}>
          <Chevron d={CHEVRON_L} />
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {contents.map((_, i) => (
              <span key={i} className={cn("size-2", i <= page ? "bg-signal" : "bg-ink-dim")} />
            ))}
          </div>
          <span className="text-xs tracking-[0.06em] text-ink-muted">
            {page + 1} de {count}
          </span>
        </div>
        <button type="button" aria-label="Página siguiente" data-magnetic="light" data-cursor-label="Página siguiente" disabled={page === count - 1} onClick={onNext} className={pageButton}>
          <Chevron d={CHEVRON_R} />
        </button>
      </nav>
    </article>
  )
}
