import type { CSSProperties } from "react"
import { rgba } from "@/shared/lib/color"
import type { SkyParams } from "@/features/sky"

/** CSS custom properties behind the `ink`, `signal` and `void` Tailwind colors, from the sky preset. */
export function themeVars(p: SkyParams): CSSProperties {
  return {
    "--void": p.voidColor,
    "--ink": p.starColor,
    "--ink-muted": rgba(p.starColor, 0.68),
    "--ink-faint": rgba(p.starColor, 0.24),
    "--ink-dim": rgba(p.starColor, 0.28),
    "--signal": p.hotColor,
    "--scrim": rgba(p.voidColor, 0.86),
  } as CSSProperties
}
