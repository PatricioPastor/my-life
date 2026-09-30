import { cn } from "@/shared/lib/utils"

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

interface ReaderProps {
  meta: string
  title: string
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

export function Reader({ meta, title, page, onPrev, onNext }: ReaderProps) {
  const count = READER_PAGES.length
  const pageButton = "press flex size-12 items-center justify-center border border-ink-faint"

  return (
    <article className="rise-late pointer-events-auto flex w-[640px] max-w-full flex-col gap-7">
      <p className="m-0 text-xs tracking-[0.06em] text-ink-muted">{meta}</p>
      <h1 className="m-0 font-display text-[40px] leading-[0.95] font-black tracking-[-0.01em] text-ink md:text-[64px]">
        {title}
      </h1>
      {/* Fixed height: pages turn in place, nothing scrolls. */}
      <div className="h-[272px] font-serif text-[21px] leading-[1.62] text-ink">
        <div key={page} className="turn flex flex-col gap-5">
          {READER_PAGES[page].map((p) => (
            <p key={p.text} className={cn("m-0", p.italic && "text-ink-muted italic")}>
              {p.text}
            </p>
          ))}
        </div>
      </div>
      <nav aria-label="Páginas" className="flex items-center justify-between">
        <button type="button" aria-label="Página anterior" disabled={page === 0} onClick={onPrev} className={pageButton}>
          <Chevron d={CHEVRON_L} />
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {READER_PAGES.map((_, i) => (
              <span key={i} className={cn("size-2", i <= page ? "bg-signal" : "bg-ink-dim")} />
            ))}
          </div>
          <span className="text-xs tracking-[0.06em] text-ink-muted">
            {page + 1} de {count}
          </span>
        </div>
        <button type="button" aria-label="Página siguiente" disabled={page === count - 1} onClick={onNext} className={pageButton}>
          <Chevron d={CHEVRON_R} />
        </button>
      </nav>
    </article>
  )
}
