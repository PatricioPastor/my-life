/** How large the caption is set: the title steps down as the text gets longer, so a long caption stays a few calm lines. */
export type CaptionTier = "lg" | "md" | "sm"

/** The longest caption (in letters) that still gets each size; anything longer is the smallest. */
export const CAPTION_TIERS = { lg: 40, md: 90 } as const

export function captionTier(text: string): CaptionTier {
  const length = text.trim().length
  if (length <= CAPTION_TIERS.lg) return "lg"
  if (length <= CAPTION_TIERS.md) return "md"
  return "sm"
}
