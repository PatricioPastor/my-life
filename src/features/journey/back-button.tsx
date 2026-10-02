import { BAR_CONTROL, BAR_LEFT, BAR_TOP } from "@/shared/lib/top-bar"

interface BackButtonProps {
  label: string
  /** Tooltip the magnetic cursor shows, for example "Volver al universo". */
  hint: string
  onClick: () => void
}

export function BackButton({ label, hint, onClick }: BackButtonProps) {
  return (
    <div className={`rise absolute ${BAR_TOP} ${BAR_LEFT}`}>
      <button type="button" onClick={onClick} data-magnetic="light" data-cursor-label={hint} className={BAR_CONTROL}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
        <span>{label}</span>
      </button>
    </div>
  )
}
