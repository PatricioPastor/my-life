interface ReplayIntroButtonProps {
  onClick: () => void
}

/** Bottom-left control that plays the whole intro again. Same weight as the back buttons. */
export function ReplayIntroButton({ onClick }: ReplayIntroButtonProps) {
  return (
    <div className="rise absolute bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-[max(2.25rem,calc(env(safe-area-inset-left)+0.5rem))]">
      <button
        type="button"
        onClick={onClick}
        data-magnetic="light"
        data-cursor-label="Ver intro"
        className="press flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
      >
        Ver intro
      </button>
    </div>
  )
}
