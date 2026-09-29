interface BackButtonProps {
  label: string
  onClick: () => void
}

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <div className="rise absolute top-7 left-9">
      <button
        type="button"
        onClick={onClick}
        className="press flex h-12 items-center gap-3 px-3 text-xs tracking-[0.08em] text-ink-muted"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
        <span>{label}</span>
      </button>
    </div>
  )
}
