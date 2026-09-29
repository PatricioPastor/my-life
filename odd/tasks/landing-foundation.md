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

- [ ] **T1 — Scaffold.** Next.js + Tailwind + ESLint + shadcn (aliases → `@/shared`) + Vitest; `typecheck` script; screaming-architecture folders; README section on structure; `.env.example`.
  - Route: delegated direct (writer trigger: 2+ non-trivial files). Writer A.
- [ ] **T2 — Sky.** Port the halftone WebGL2 sky from the canvas into `src/features/sky`: params/presets merge, seeded sparkle layout, `pushSparkle`, color helpers, drift, shaders, and a `HalftoneSky` client component with an imperative handle (`pulse`, `aim`) plus a WebGL-missing fallback.
  - Route: delegated direct. Writer A.
- [ ] **T3 — Gate.** `src/features/gate`: handle normalization and validation, the gate state machine (idle, invalid, checking, denied, requested, granted), the `AccessPolicy` port with an env whitelist adapter and a server action, the ASCII tunnel canvas, and the gate screen UI.
  - Route: delegated direct. Writer B.
- [ ] **T4 — Journey.** `src/features/journey` reducer (gate → sky → place → entry, back, paging), `src/features/facets` content and place view, `src/features/reader` paginated reader, dive transitions, fonts (Doto, Silkscreen, Spectral), home route composition.
  - Route: delegated direct. Writer B.
- [ ] **T5 — Push.** Push `feat/landing-foundation` to `origin`.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Home renders the gate first; entering a whitelisted handle warps into the sky; a non-whitelisted handle shows the denied state with "Ask for an invite".
- The sky, facet place, and reader match the canvas composition, copy, palette, typefaces, and motion (including reduced motion).
- The whitelist is read only on the server; client bundles contain no handles.

## Progress

- 2026-09-29: Remote `my-life` is empty and public, so there was nothing to clone. Local repo initialized with `main` (`78a60f7`) and `feat/landing-foundation`. Document created. This supersedes the paused draft in `theduck/odd/tasks/landing-foundation.md`.

## Verification evidence

_Pending._

## Next step

Writer A runs T1 + T2.
