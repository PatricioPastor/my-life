# Portal heartbeat

- **Locator:** `odd/tasks/portal-heartbeat.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/portal-heartbeat/tasks` (project `theduck`)
- **Branch:** `feat/portal-heartbeat` from `main` @ `968b6a2`
- **Delivery:** the user explicitly asked to finish and push to `main` ("Terminás y pusheá a main").

## Objective

Rework the entry portal (the ASCII tunnel of the gate). User feedback:

- the ASCII can look better;
- try a warm palette;
- color changes feel rough and should transform smoothly;
- the pulse needs a heartbeat: a pulse is expelled, and as it finishes passing, the next one starts, with irregular but smooth rhythms;
- the background should be darker so depth reads;
- the ASCII or portal needs a glow.

## Portal palette (user-provided, exact)

| Role | Name | Hex |
|---|---|---|
| Ring | Sunflower Gold | `#FFC15E` |
| Ring | Sunlit Clay | `#F7B05B` |
| Ring | Sandy Brown | `#F7934C` |
| Ring | Bronze Spice | `#CC5803` |
| Dim tones / haze | Coffee Bean | `#1F1300` |

- The portal background goes darker than Coffee Bean (near-black with a coffee tint) so depth reads.
- The sky keeps the periwinkle palette. UI details keep School Bus Yellow `#FFC600`.

## Authorized scope

- A portal-only palette. The recursive seeded ring sequence stays and uses the four ring colors.
- Smooth color: characters blend between adjacent ring colors across the ring phase (quantized steps so draws stay batched), and the center glow crossfades between the current and next ring colors.
- Heartbeat: irregular beats (including lub-dub doubles) from a seeded scheduler.
  - Each beat gives a smooth speed surge and a bright pulse wave travelling outward.
  - The next beat fires when the current wave is near the end of its travel, with jitter.
  - The gate states modulate the rhythm: checking is faster and stronger, denied is slow and weak, and granted warps.
- Glow: a bloom layer, for example a half-resolution mirror canvas with CSS blur and screen blend, whose intensity follows the beat.
- ASCII quality: orientation-aware glyphs on ring lines, a finer grid on desktop, a crisp font, and bounded cell counts on mobile.
- Fix `R3-ring-cap-throws-in-draw-loop`: ring color lookup must be bounded (cyclic sequence) and must never throw in the render path.
- Reduced motion: a static frame with glow and no heartbeat animation.

## Constraints

- Public repo: `.env.local` stays untouched and uncommitted.
- Conventional Commits with no AI attribution.
- English code.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure logic is test-first:
  - the heartbeat scheduler and envelopes;
  - the pulse wave progress;
  - the smooth color blend and its quantization;
  - the glyph orientation mapping;
  - the bounded cyclic ring colors.

## Tasks

- [x] **T1 — Heartbeat, smooth color and palette.** Pure modules plus the renderer wiring and the darker background. Route: delegated direct (writer trigger).
- [x] **T2 — Glow and ASCII quality.** Bloom layer, orientation glyphs, grid and font, mobile bounds. Route: delegated direct.
- [x] **T3 — Deliver.** RDD approved; `main` fast-forwarded and pushed, as the user asked.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- No abrupt color switches: glow and ring colors transition continuously.
- Beats are irregular, never overlap abruptly, and each starts as the previous wave is finishing.
- The ring color lookup is bounded and never throws in the draw loop.

## Progress

- 2026-09-30: Document created.
- 2026-09-30: T1 done: warm portal palette, bounded cyclic ring colors (period 1024, no throw), smooth quantized color blend, seeded heartbeat (lub-dub, gate profiles, surge and pulse band), darker depth with vignette, static reduced-motion frame that repaints on gate change. Route: delegated direct (writer).
- 2026-09-30: T2 done: half-resolution CSS-blurred screen-blend bloom canvas driven by the beat, tangent glyphs on ring spines, viewport-aware bounded grid (<=12k cells), Silkscreen glyph font.

## Verification evidence

- Writer: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` passed 181/181 across 25 files; `pnpm build` passed.
- Parent spot check: `pnpm test` passed 181/181.
- Screenshots:
  - Headless Chromium at 1440×900 and 390×844, from `pnpm dev`.
  - Seen: a near-black coffee background, warm rings with tangent glyphs, and a pulsing center glow. Silkscreen reads crisply.
  - The bloom looked faint headless and is unverified in Safari. The reduced-motion frame was not captured.
- RDD slice `477058f..f81921f`:
  - Assessed medium, `slice_budget_reached`, 1052 lines.
  - Consent granted by the user.
  - `review-reliability` → **approved**.
  - Acknowledged; authority burned (lineage `review-e951385dcefae165`).
  - Reviewed boundary is now `f81921f`.

## Review follow-ups (advisory, not accepted yet)

- `R3-renderer-blend-key-wiring-untested`: the renderer's blend key (ring/next, step, level), the heartbeat bands and the glow crossfade are untested as wired.
- `R3-refresh-path-untested`: `refresh()` repainting the reduced-motion frame on a gate change, and its no-op after `stop()` or while animating, are untested.
- `R3-uint8-cycle-silent-wrap`: the ring cycle is stored in a `Uint8Array`, so a palette of more than 256 colors would wrap silently. It should validate or widen. Not reachable with 4 colors.
- `R3-stale-next-step`: fixed by this update.

## Next step

- [x] **T3 — Deliver.** RDD done. Fast-forward `main` and push, as the user asked.
- Later: tune bloom strength in a real browser, including Safari, and decide on the follow-ups above.
