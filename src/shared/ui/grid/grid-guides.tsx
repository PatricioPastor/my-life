import { cn } from "@/shared/lib/utils"
import { GRID, GRID_X } from "./grid"

const COLUMNS = 6

/**
 * The place grid drawn as faint vertical hairlines, one on every column edge: a quiet reference the content lines up
 * on. It is laid out on the grid itself (the same template and insets), so a guide and an edge never disagree.
 * Decoration only, and nothing on a phone, where the grid is one column.
 */
export function GridGuides({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("rise pointer-events-none absolute inset-y-0 max-md:hidden", GRID, GRID_X, className)}>
      {Array.from({ length: COLUMNS }, (_, i) => (
        <span key={i} className={cn("border-l border-ink-faint/40", i === COLUMNS - 1 && "border-r")} />
      ))}
    </div>
  )
}
