/** The reading progress: a thin ring and a two-digit Silkscreen percentage. Exposed as a progressbar. */
export function ReadingProgress({ value }: { value: number }) {
  return (
    <div className="rd-progress" role="progressbar" aria-label="Progreso de lectura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <svg className="rd-ring" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <circle className="rd-ring-track" cx="12" cy="12" r="10.5" />
        <circle className="rd-ring-fill" cx="12" cy="12" r="10.5" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - value} />
      </svg>
      <span className="rd-percent t-label">{String(value).padStart(2, "0")}%</span>
    </div>
  )
}
