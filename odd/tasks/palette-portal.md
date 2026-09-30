# Palette and recursive portal

- **Locator:** `odd/tasks/palette-portal.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/palette-portal/tasks` (project `theduck`)
- **Branch:** `feat/palette-portal` from `main` @ `76026d8`

## Objective

Move the landing from the crimson preset to the user's palette. Every star is drawn in an exact palette color, one yellow is reserved for UI details, and the entry portal (the ASCII tunnel) recolors its rings through a recursive, seeded-random but exact rule.

## Palette (user-provided, exact)

| Role | Name | Hex |
|---|---|---|
| Background (void) | Shadow Grey | `#191923` |
| Text (ink) / star | Porcelain | `#FBFEF9` |
| Star / gas | Soft Periwinkle | `#8377D1` |
| Star / gas peak | Sunflower Gold | `#F3B61F` |
| UI details only (signal) | School Bus Yellow | `#FFC600` |

- The facet star colors were confirmed by the user:
  - Stories → Periwinkle
  - Writing → Porcelain
  - Projects → Sunflower Gold
  - Now → Periwinkle (repeat accepted)
- School Bus Yellow is never used as a star or gas color, so the two yellows never compete.
- The gas ramp tints are derived only from the palette (Shadow Grey mixed toward Periwinkle):
  - haze `#2C2A42` (18%)
  - dusk `#3E3A60` (35%)
  - wine `#59518B` (60%)
  - crimson → Periwinkle `#8377D1`
  - hot → Sunflower Gold `#F3B61F`
  - star → Porcelain `#FBFEF9`

## Authorized scope

- A new default sky preset built from the palette; the older presets stay available.
- Per-star exact colors: sparkles pick one of Porcelain, Periwinkle or Sunflower Gold by index, never blended. Facet anchors carry their color; the place title takes the facet's color.
- Theme: void, ink and signal move to Shadow Grey, Porcelain and School Bus Yellow. The signal color applies to details: `@`, caret, focus bar, submit border, list marks, pips, hover labels and status errors.
- Portal: each tunnel ring's color is a recursive sequence, `c(n) = step(c(n−1), rand(seed, n))`. It never repeats the previous ring's color, uses only exact palette colors, and is seeded once per visit. The center glow takes the color of the next ring to be born.

## Constraints

- Public repo: `.env.local` stays untouched and uncommitted.
- Conventional Commits with no AI attribution. Push and merge only after the user approves.
- English code and copy.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure modules are test-first: the palette, the preset, facet colors, and the ring color sequence.

## Tasks

- [x] **T1 — Palette sky and theme.** Palette module, new default preset, 3-color exact sparkle tint, facet colors on stars and place titles, theme vars. Route: delegated direct (writer trigger).
- [x] **T2 — Recursive portal.** Ring color sequence (pure, memoized, tested), tunnel renderer colored per ring with exact palette colors (full and dim levels only), glow from the next ring, seed per visit. Route: delegated direct.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- No crimson colors remain in the default experience.
- School Bus Yellow appears only on UI details.
- Consecutive rings never share a color. The same seed always yields the same sequence.

## Progress

- 2026-09-30: Document created; the user chose Shadow Grey as the background.
- 2026-09-30: T1 done. RED (12 failing tests) then GREEN (132 tests), typecheck clean. Palette module, periwinkle default preset, exact index-picked star tints, facet colors, theme vars.
- 2026-09-30: T2 done. ring-colors and tunnel-math pure modules tested RED then GREEN; renderer draws per-ring palette colors at two levels, glow from the next ring, seed per mount. The tunnel no longer reads sky params (fixed ring palette).

## Verification evidence

- Writer: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` passed 149/149 across 21 files; `pnpm build` passed.
- Parent spot check: `pnpm test` passed 149/149; `pnpm typecheck` passed.
- Not observed in a real browser yet. The glow color changes abruptly when a ring is born; there is no crossfade.
- RDD slice `7343707..477058f` (DM request, mobile sizing, overscroll, palette, portal):
  - Assessed medium, `slice_budget_reached`, 821 lines.
  - Consent granted by the user.
  - `review-reliability` → **approved**.
  - Acknowledged; authority burned (lineage `review-a571dc24871f3b47`).
  - Reviewed boundary is now `477058f`.

## Review follow-ups (advisory, not accepted yet)

- `R3-ring-cap-throws-in-draw-loop`: `phase` grows forever. After roughly 500 hours of an open gate tab, the ring index passes `MAX_RING` and `RangeError` freezes the tunnel; the memo also grows with phase. Fix: wrap the index modulo a period, or clamp instead of throwing in the render path.
- `R3-per-ring-grouping-untested`: the renderer's group encoding (`palette*2 + level`), the `FULL_FROM` threshold and the glow mapping are untested.
- `R3-rerequest-path-untested`: the `requested → requested` re-copy transition has no test.
- `R3-navigator-stub-leak-on-failure`: `journey.test.tsx` removes its navigator stub in the test body instead of `afterEach`.

## Next step

Fast-forward `main` and push once the user approves.
