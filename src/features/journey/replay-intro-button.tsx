interface ReplayIntroButtonProps {
  onClick: () => void
}

/** Bottom-left control that plays the whole intro again. Same weight as the back buttons. */
export function ReplayIntroButton({ onClick }: ReplayIntroButtonProps) {
  return (
    <div className="rise absolute bottom-7 left-9">
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
