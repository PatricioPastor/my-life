import Link from "next/link"

/** Bottom-left way out of the work galaxy into the whole story at "/". Same place and weight as the intro replay. */
export function StoryLink() {
  return (
    <div className="rise absolute bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-[max(2.25rem,calc(env(safe-area-inset-left)+0.5rem))]">
      <Link
        href="/"
        data-magnetic="light"
        data-cursor-label="Ver mi historia"
        className="press flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
      >
        Mi historia
      </Link>
    </div>
  )
}
