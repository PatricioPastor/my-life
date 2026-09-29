# Landing foundation

- **Locator:** `odd/tasks/landing-foundation.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/landing-foundation/tasks` (project `theduck`; Engram has no `my-life` project yet)
- **Branch:** `feat/landing-foundation` (base: `main` @ `78a60f7`, empty initial commit)

## Objective

Build the personal landing as a Next.js app that implements the approved Claude Design canvas: an Instagram-whitelist gate with an ASCII tunnel, a halftone WebGL sky as the hub, facets hung as stars, a facet "place", and a paginated reader. No header navigation, no conventional page scroll.

## Problem and why

- The design is approved on the canvas (`https://claude.ai/artifact/XxkjMJkENftMJeUCsJ1tk5`, `project/Main.dc.html` v3). It has to become the real codebase.
- The site launches invitation-only: visitors enter with their Instagram handle and are checked against a whitelist.

## Authorized scope

- Next.js (App Router), TypeScript, Tailwind CSS, ESLint, `src/` directory, pnpm, shadcn with aliases under `@/shared`, Vitest + Testing Library.
- Screaming architecture: `src/features/<domain>` for `sky`, `gate`, `journey`, `facets`, `reader`; `src/shared/{ui,lib}` for cross-cutting code; `src/app` holds routes only.
- Whitelist access check behind a port (`AccessPolicy`) with an env-backed adapter (`INSTAGRAM_WHITELIST`), evaluated server-side so the list never ships to the client.
- Work-unit commits on `feat/landing-foundation`; push that branch to `origin` with the user's `gh` session over HTTPS. No merge, no PR unless asked.

## Out of scope / pending

- **Ownership verification.** Typing a handle does not prove the account belongs to the visitor. Real verification (for example a DM code) and a session cookie are future work. v0 is a velvet rope, not security.
- Real content for stories, writing, projects, and now (placeholders only). Blog content source.
- Mobile layout beyond not breaking (the canvas is desktop 1440×900).

## Constraints

- The repo is **public**: never commit real handles, secrets, or `.env*` files other than `.env.example`.
- Commits: Conventional Commits, no AI attribution lines, author = repo-local noreply identity.
- Technical artifacts and UI copy in English, matching the canvas copy.
- Windows 11, Node 24.15, pnpm 11.1.

## TDD

- **Mode:** strict (source: global `CLAUDE.md` "Strict TDD Mode: enabled").
- **Runner:** `pnpm test` (Vitest run), established in T1. Pure domain logic is test-first with observed RED → GREEN → REFACTOR. WebGL and canvas rendering are not unit-tested; components get smoke tests where jsdom allows.

## Delivery

- Strategy: single feature branch with work-unit commits, as the user asked ("en una rama, sin mergear"). The PR chain strategy (`stacked-to-main` or `feature-branch-chain`) gets decided when a PR is requested.
- Forecast (authored lines, generated files excluded): T1 ~150, T2 ~600, T3 ~600, T4 ~700 → ~2050.
- RDD: on (global). Each work-unit commit is assessed with `gentle-ai review assess --committed-only` against the last reviewed boundary (first boundary: `78a60f7`).

## Tasks

- [x] **T1 — Scaffold.** Next.js + Tailwind + ESLint + shadcn (aliases → `@/shared`) + Vitest; `typecheck` script; screaming-architecture folders; README section on structure; `.env.example`.
  - Route: delegated direct (writer trigger: 2+ non-trivial files). Writer A. Commit `edfcc6f`.
- [x] **T2 — Sky.** Commit `ba078d7`. Port the halftone WebGL2 sky from the canvas into `src/features/sky`: params/presets merge, seeded sparkle layout, `pushSparkle`, color helpers, drift, shaders, and a `HalftoneSky` client component with an imperative handle (`pulse`, `aim`) plus a WebGL-missing fallback.
  - Route: delegated direct. Writer A.
- [x] **T3 — Gate.** Commit `e03372a`. `src/features/gate`: handle normalization and validation, the gate state machine (idle, invalid, checking, denied, requested, granted), the `AccessPolicy` port with an env whitelist adapter and a server action, the ASCII tunnel canvas, and the gate screen UI.
  - Route: delegated direct. Writer B.
- [x] **T4 — Journey.** Commit `8e477dc`. `src/features/journey` reducer (gate → sky → place → entry, back, paging), `src/features/facets` content and place view, `src/features/reader` paginated reader, dive transitions, fonts (Doto, Silkscreen, Spectral), home route composition.
  - Route: delegated direct. Writer B.
- [ ] **T5 — Push.** Push `feat/landing-foundation` to `origin`.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Home renders the gate first; entering a whitelisted handle warps into the sky; a non-whitelisted handle shows the denied state with "Ask for an invite".
- The sky, facet place, and reader match the canvas composition, copy, palette, typefaces, and motion (including reduced motion).
- The whitelist is read only on the server; client bundles contain no handles.

## Progress

- 2026-09-29: Remote `my-life` is empty and public, so there was nothing to clone. Local repo initialized with `main` (`78a60f7`) and `feat/landing-foundation`. Document created. This supersedes the paused draft in `theduck/odd/tasks/landing-foundation.md`.

- 2026-09-29: T1 + T2 done by Writer A.
  - shadcn `init` reset aliases to `@/components`; they were restored to `@/shared/*`.
  - shadcn generated `cn` imported from an unrelated npm package `cn`; it was replaced with `clsx` + `tailwind-merge`.
  - `typecheck` = `next typegen && tsc --noEmit`, because `LayoutProps` is a generated type.
  - React Compiler stays enabled, as scaffolded.
- 2026-09-29: T3 + T4 done by Writer B.
  - A RED run caught a real bug: `" @Ana "` normalized to `@ana`. Whitespace is now stripped before `@`.
  - The server action fails closed: an error shows denied.
  - Metadata sets `robots: noindex, nofollow`, since the site is invitation-only.
  - Layout is fluid rather than a fixed 1440×900 stage. Below 768px the list goes full width.
  - Facet labels now ride the dive zoom with the canvas, which fixes a brief misalignment the prototype had.
  - Reducers guard illegal transitions: `resolved` is only accepted while checking, and `facetOpened` only from the sky.
  - Removed the unused create-next-app SVGs.

## Verification evidence

- T1/T2 RED: new suites failed with `Failed to resolve import "./color"` (and likewise for `drift`, `sky-params`, `sparkles`, `shaders`), and `skyFallbackGradient is not a function`, before implementation.
- Writer A, after T2: `pnpm lint` passed with no output; `pnpm typecheck` passed; `pnpm test` passed 35/35 across 7 files; `pnpm build` passed with `/` static.
- Parent spot check: `pnpm test` passed 35/35; `pnpm typecheck` passed.
- The WebGL sky has not been observed in a real browser yet (no dev server run; jsdom has no WebGL). The GLSL was checked byte-identical to the canvas prototype.
- RDD slice `78a60f7..ba078d7`:
  - Assessed medium, `slice_budget_reached`.
  - Consent granted by the user.
  - One lens (`review-reliability`) → **approved**.
  - Acknowledged; authority burned (lineage `review-08f5119bf5d9eaeb`).
  - Reviewed boundary is now `ba078d7`.
- T3/T4 RED: suites failed with `Failed to resolve import` for `./handle`, `./gate-machine`, `./env-whitelist-policy`, `./check-access`, `./content`, `./journey-machine`, `./theme` and `./reader` before implementation. Component smoke tests were written after the components.
- Writer B, after T4:
  - `pnpm lint` passed with no output.
  - `pnpm typecheck` passed.
  - `pnpm test` passed 109/109 across 17 files.
  - `pnpm build` passed with `/` static.
  - Canary check: `INSTAGRAM_WHITELIST=zz_canary_handle pnpm build`, then `.next/static` searched for the handle → 0 matches.
- Parent spot check: `pnpm test` passed 109/109; `pnpm lint` passed. The only tracked `.env*` file is `.env.example`.
- The gate, tunnel, sky and motion have still not been observed in a real browser.
- RDD slice `ba078d7..8e477dc`:
  - Assessed medium, `slice_budget_reached`.
  - Consent granted by the user.
  - One lens (`review-reliability`) → **approved**.
  - Acknowledged; authority burned (lineage `review-751b67fd0ea0ee95`).
  - Reviewed boundary is now `8e477dc`.

## Review follow-ups (advisory, not accepted yet)

- `R3-anchors-never-relaid`: the renderer re-lays out sparkles only on seed change, not when the `anchors` prop changes.
- `R3-context-loss-unrecoverable`: after `webglcontextlost` nothing rebuilds GL state and the fallback never shows, leaving a black canvas.
- `R3-reduced-motion-stale-frame`: under reduced motion, changing the preset or pixel props, or `hidden` becoming false, does not repaint. `resize()` also paints while hidden.
- `R3-renderer-untested`: `stop()` cleanup, `onDown` guards and seed relayout have no tests (mocked GL context or extracted handlers).
- `R3-invite-request-not-sent` (product decision): "Ask for an invite" only flips local state, yet the UI says "Request sent." Nothing is actually sent. Either wire a real request channel or change the copy.
- `R3-sky-hidden-reduced-motion-activated`: the journey is the first caller that turns `hidden` from true to false. Under reduced motion the sky may show a stale or blank frame after the gate. This is the same root cause as `R3-reduced-motion-stale-frame`.
- `R3-tunnel-renderer-untested`: the tunnel renderer's draw loop, cleanup and wake guards are untested. Under reduced motion the tunnel never repaints on gate state changes.

## Next step

T5: push `feat/landing-foundation`. The remote is empty, so the first pushed branch becomes GitHub's default; decide whether `main` is pushed too.
