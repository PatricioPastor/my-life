# Memory orb and memories space

- **Locator:** `odd/tasks/memory-orb.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-orb/tasks` (project `theduck`)
- **Branch:** `feat/memory-orb` from `main` @ `fee0d77`

## Objective

A color-shifting orb floats across the whole galaxy. Clicking it ("Agregar recuerdo") takes the visitor, through a portal journey like the entrance one, to a memories space where points float, one per approved memory. Visitors can add a memory: a photo, a short text and a date. Each memory stays pending until the owner approves it.

## User request (summary)

- An orb that floats around the whole galaxy and keeps changing colors: related to the project, with contrast, but tasteful; "medio RGB" is fine.
- Clicking it means "Agregar recuerdo". It takes you somewhere else through a portal journey, where points float; each point is an uploaded image.
- Images are stored in Cloudinary.

## Decisions

- **Who uploads:** admitted visitors. Nothing shows until the owner approves it.
- **Approval:** a manual SQL `UPDATE` in the database for now. No admin UI, and no Cloudinary moderation.
- **Database:** Neon Postgres with Prisma 7. The user created an empty database and has both the pooled and the direct connection strings.
  - Runtime uses the pooled `DATABASE_URL`; the Prisma CLI uses the direct `DIRECT_URL`.
  - This is the base for later features.
- **A memory:** a photo, a short text (up to about 140 characters) and the date it happened.
- **Delivery:** everything on `feat/memory-orb`. Main is fast-forwarded in a single step at the end, after the user approves.
- **Database rules (user, mandatory):**
  - **snake_case:** every table, column and enum is snake_case through Prisma `@@map` and `@map`.
  - **RLS on every table:** `ENABLE` and `FORCE ROW LEVEL SECURITY`, with explicit policies per operation.
    - RLS works per table, not per column; column-level limits use column `GRANT`s.
    - Neon's owner role (`neondb_owner`, a member of `neon_superuser`) has `BYPASSRLS`, verified in the Neon docs. The runtime therefore connects with a restricted login role, `app_user`. It must be created with SQL, not from the Neon console, because console roles inherit `BYPASSRLS`.
    - The owner role is for migrations only. A guard refuses to run when the runtime `DATABASE_URL` uses the owner role.
- **Orb colors:** cool RGB hues (cyan, violet, magenta) that contrast with the warm ember galaxy without fighting it.
- **Identity:** when the gate admits a handle, it sets a signed `httpOnly` session cookie, so the server knows who uploads.
  - Known limit: the gate compares a typed Instagram handle against the whitelist, which is not real authentication. Anyone who knows an admitted handle can upload, and the approval step is what mitigates it.
- **Secrets:** they live only in `.env.local` and in Vercel, never in the repo.
  - Agents must not read `.env.local`; a deny rule blocks it.
  - Variables: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

## Constraints

- Public repository: never commit `.env.local`, credentials or connection strings.
- Conventional Commits with no AI attribution.
- Code and docs in English. UI copy in neutral Spanish (`tú`).
- Screaming architecture: `src/features/memories` holds the domain, ports and use cases. Adapters such as Prisma and Cloudinary live behind ports and are `server-only`.
- `/` stays static. The database is only reached through server actions or route handlers.
- Remote operations need explicit user authorization first: migrations against Neon, role creation, and anything touching Cloudinary or Vercel.
- Dev servers use port 3001, and a writer stops only the PID it started, never processes by name.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test` (Vitest).
- **Test-first:** domain rules, the session cookie, the use cases with fake ports, the orb motion and colors as pure functions, and upload validation.

## Tasks

- [x] **T1 — Data foundation.**
  - Prisma 7 with the Neon adapter.
  - `Memory` model, snake_case mapped.
  - Migration SQL with RLS enabled and forced, policies and grants for `app_user`.
  - `MemoryRepository` port with a Prisma adapter.
  - A transaction helper that sets the visitor handle for the policies.
  - The owner-role guard.
  - Code only: no remote operations.
- [x] **T2 — Visitor session.**
  - The gate sets a signed `httpOnly` cookie on success.
  - A `currentVisitor()` server helper.
  - Expiry and tamper checks.
- [x] **T3 — Orb.**
  - Wandering, color-shifting orb in the sky; a magnetic-cursor target with the "Agregar recuerdo" label.
  - Click starts the portal journey to the memories space.
  - Reduced motion is respected.
- [x] **T4 — Memories space.**
  - Floating orbs for approved memories (plus the visitor's own pending ones), with Cloudinary thumbnails.
  - Opening an orb shows the photo, the text and the date.
  - Empty, loading and error states.
  - A deep, opaque "other dimension" with round dust, a serif title and the way back renamed "Universo" (user art direction).
- [ ] **T3b — Orb and portal polish (user feedback, 2026-10-01).**
  - Hover: remove the amber backdrop the sky paints around a captured target, because it dulls the orb.
  - A better hover animation: the orb zooms in and turns into a more realistic window onto the memories dimension (dark void, dust and round orbs inside, a lens-like rim).
  - The way back from the memories place runs through the portal too, faster (about half the trip).
  - Bug seen in the T4 shots: while the viewer dialog is open, the orb behind it keeps the cursor captured and its label shows over the dialog.
- [ ] **T5 — Upload.**
  - Form: photo, text and date.
  - A server-signed Cloudinary upload; the server verifies the asset, then inserts a `pending` row under RLS as the visitor.
  - Size, type and per-handle rate limits.
  - A "pending approval" confirmation.
- [ ] **T6 — Remote setup (needs authorization).**
  - Create `app_user` with SQL and run the migrations on Neon.
  - The user swaps `DATABASE_URL` to `app_user` and adds the variables to Vercel.
- [ ] **T7 — Deliver.**
  - Full checks and RDD per slice.
  - Fast-forward main and push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, and `/` stays static.
- Every table has RLS enabled and forced, with policies. `app_user` can read only approved memories and can insert only pending ones under its own handle. Nothing in the runtime path connects as the owner.
- Every table, column and enum is snake_case in the database.
- Approving a memory with a manual `UPDATE ... SET status = 'approved'` makes it appear in the space.
- No secret or font file is tracked by git.

## Delivery forecast

About 1,600 authored changed lines (T1 ~300, T2 ~200, T3 ~350, T4 ~400, T5 ~400). Single feature branch, delivered at the end, as the user chose. RDD is assessed per work-unit commit.

## Progress

- 2026-10-01: Document created. Decisions above confirmed with the user: visitors upload with approval, approval by SQL, Neon and Prisma, photo + text + date, a single delivery at the end, RLS on every table and snake_case mapping.

- 2026-10-01: T1 done (route: delegated writer, 2+ non-trivial files).
  - Prisma 7.10 with `@prisma/adapter-neon` (WebSocket `Pool`, so interactive transactions work; the HTTP adapter has none). `prisma-client` generator into `src/generated/prisma` (gitignored), generated by `postinstall` and before `build`. pnpm build approval for `prisma` and `@prisma/engines` is set in `pnpm-workspace.yaml` (`allowBuilds`).
  - `prisma.config.ts` reads `DIRECT_URL` without `env()`, so `generate` and `build` pass with no database variables.
  - Migration `20261001000000_init`: enum and `memories` table (snake_case), the `app_user` role (`NOLOGIN NOBYPASSRLS`, idempotent), column-level `INSERT` grant, `ENABLE` + `FORCE` RLS with a select and an insert policy, and `_prisma_migrations` locked down. It was generated offline; nothing touched Neon.
  - `src/features/memories`: domain, `validateNewMemory`, `MemoryRepository` port and the Prisma adapter. `src/shared/db`: lazy client, `withVisitor`, `assertRuntimeRole`, plus static lints for the migration SQL and `schema.prisma`.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
  - Commit `f0d981f`. The RDD review (medium; the slice budget was reached) was granted.
    - It found one critical issue: `getPrisma()` never cached the client in production, so every repository call opened a new client and WebSocket pool.
    - Fixed in `36f2623` (route: inline, one file plus its test). The client is now cached in every environment, covered by `client.test.ts`. RED was observed on the production case.
    - Targeted validation approved; lineage `review-44f696e6128708f0` acknowledged. Reviewed boundary: `36f2623`.

- 2026-10-01: T2 done (route: delegated writer, 2+ non-trivial files).
  - `src/features/gate/session` (`server-only`; moved from `src/shared/session` so shared code never imports a feature, the gate owns visitor identity): `signSession` and `verifySession` (HMAC-SHA256, constant-time compare, strict payload `{ h, exp }`, handle checked with the gate's `isValidHandle`), `getSessionSecret` (at least 32 decoded bytes, else not configured), cookie constants and options, and `currentVisitor()`, which also re-checks the handle against `AccessPolicy` so removing it from the whitelist revokes the session.
  - Cookie `ml_visitor`: `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, 30 days.
  - The gate action now goes through `admitVisitor` (`src/features/gate/access/admit-visitor.ts`). A denied or invalid handle gets no cookie. With no valid `SESSION_SECRET` it still admits, skips the cookie and logs one handle-free warning.
  - Commits `5c452a5` (writer) and `fb99d8b` (inline refactor: the session moved under the gate). The full suite passed with 726 tests.
  - RDD (medium, slice budget reached) was granted and approved with no findings. Lineage `review-d616214a38b5a470` acknowledged. Reviewed boundary: `fb99d8b`.

- 2026-10-01: T3 done (route: delegated writer, 2+ non-trivial files; strict TDD, RED observed first).
  - **Orb look: shader, not DOM.** The orb is painted by the sky shader (`uOrb`, `uOrbColor`, `uOrbFringe`) so it shares the halftone texture: a soft gaussian halo whose red, green and blue channels fall off at slightly different radii (the RGB fringe), a thin chromatic rim, dithered halftone dots that dissolve at the edge, and a small hot core. The film grain dithers the gradient, so there is no banding. A real `<button>` (`data-magnetic="strong"`, label "Agregar recuerdo", Ctrl context "Deja un recuerdo en este universo.") rides the same position, like the facet stars. When WebGL is unavailable the button draws a plain CSS glow instead.
  - **Colors:** OKLCH, lightness 0.78, chroma 0.12, hue swinging 195 to 330 (cyan, periwinkle, violet, magenta, back) on a 12 s cosine cycle. Chroma 0.15 was tried first and rejected: the sRGB gamut edge made a channel jump between frames. Out-of-gamut values lose chroma only, never hue. The tunnel for this trip uses `ORB_PORTAL`, four cool rings from the same space over a near-black with a violet cast.
  - **Motion:** a pure seeded path in CSS px: waypoints joined by a C1 cubic Hermite curve, each waypoint drawn so the curve keeps its clearance from every keep-out box (facet stars with their labels, the name mark, the bottom controls, the planet) and its margin from the edges, then an exact guard clamps any residual. Speed is about 22 px/s. Clearance and radius scale with the viewport (radius 30 to 46 px), because a 390 px phone has no room for a 64 px berth. Easing to a stop on hover, focus or cursor capture is an exponential rate (tau 0.6 s to stop, 0.7 s to resume); the path clock only advances by the rate, so position is continuous. Reduced motion: a tenth of the travel, a quarter of the color speed, and a slow repaint on a timer that rides a frame (the sky has no loop in that mode).
  - **Journey:** the machine gains `orbWarp` and `memories` screens and `orbOpened` / `orbArrived`; `orbOrigin` makes the sky dive toward the orb. The tunnel is the gate's `AsciiTunnel` with a new `palette` option, not a fork; it opens out of the orb's position, runs 1.7 s, then lingers 1.3 s over the memories space while it fades. The sky stays mounted through the round trip. The memories place is `src/features/memories/ui/memories-place.tsx` (prop `memories`; title, empty state; the back control is the journey's `BackButton`). "Ver intro" is hidden there. `memory_orb_opened` is in the analytics allow-list with no props.
  - **Files:** new `src/features/orb/*`, `src/features/memories/ui/*`, `src/features/facets/facet-keep-out.ts`, `src/features/journey/sky-keep-out.ts`; changed the sky shader, renderer and handle, the tunnel renderer and `AsciiTunnel`, the journey machine and screen, the analytics events, `globals.css`.
  - **Visual check:** Playwright (Chromium, software WebGL) on :3001 with a test whitelist handle passed through the process environment: 1440x900 and 390x844 sky, orb color cycle, hover easing, magnetic label, portal frames, the memories place, back, and keyboard Tab + Enter. Reduced motion checked too. Software GL renders about 2 frames per second, so timing there is slower than on a real GPU.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (801 tests) and `pnpm build` pass; `/` stays static.
  - Commit `e03990a`. RDD (medium; the slice budget was reached) was granted and approved with no findings; lineage `review-3acd2a5d6829befa` acknowledged. Reviewed boundary: `e03990a`.
  - Open notes: on narrow phones the orb roams a smaller free area. It restarts at its seed start after a facet visit.

- 2026-10-01: T4 done (route: delegated writer, 2+ non-trivial files; strict TDD, RED observed first on every new module).
  - **Server read path.** `MemoryRepository.listForVisitor(handle)` replaces `listApproved` (unused). It runs in `withVisitor`, so the policy returns approved rows plus the visitor's own, and repeats that in an explicit `where` (approved, or own and pending, so rejected never show), ordered by `happenedOn` then `createdAt`, capped at 300 (`MEMORY_LIST_LIMIT`). The `listMemories()` server action (`src/features/memories/actions.ts`) is a thin wiring over the pure `listMemoriesWith(deps)`: no session gives `no_session`; any failure (missing `CLOUDINARY_CLOUD_NAME`, the owner-role guard, the database, a bad public id) gives `unavailable` with one log line carrying only the error name, no PII. DTO: `{ id, caption, happenedOn (YYYY-MM-DD), status, width, height, thumbUrl, fullUrl }`, with no handle and no public id.
  - **Cloudinary.** `cloudinaryUrl(cloud, publicId, transform)` is pure (no SDK, no network), encodes each public id segment and refuses `.`/`..`/empty segments. Thumbnails `f_auto,q_auto,c_fill,g_auto,w_160,h_160`, full images `f_auto,q_auto,c_limit,w_1600`. Plain `<img>` with an eslint justification, no `next/image` and no `remotePatterns`: the URL is already transformed at the source, so the optimizer would only proxy it.
  - **Art direction (from the user).** The place paints its own opaque void (`mem-void`: near-black `#040309` with a faint violet cast, a faint distant glow and a deep vignette), so the ember sky never shows. `skyPausedFor(screen)` is true at the gate and in `memories`, so the sky skips painting there (its loop idles, it stays mounted, and it wakes on the way back); under the orb portal it keeps painting. The portal's fade-out therefore reveals the dark dimension. Dust: one DPR-aware 2D canvas (`DustCanvas`), three depth layers of tiny round motes (size, softness, alpha, speed and pointer parallax all grow with depth), seeded and a pure function of time, 60 motes on phones and 90 to 150 on desktop, pointer parallax on fine pointers only, paused when the tab is hidden or the canvas is off screen, one still frame under reduced motion. Orbs: round, with a seeded depth (`orbDepth`/`orbMetrics`) setting size 9 to 16 px, brightness, focus and drift amplitude, a radial falloff, a halo and a hint of chromatic rim from the neighbouring hue of `ORB_PORTAL.rings`. Title "Recuerdos" in Gambarino (`t-title`, `--type-display`, porcelain `#f3f0ea` with a faint cool glow); `ensureGambarinoStylesheet()` from the onboarding font loader runs on mount and no font file is added. Empty, error and loading texts use `t-body` at `--type-2`. The back control is now "Universo" ("Volver al universo") in both places.
  - **The orbs.** A pure seeded layout (`layoutPoints`): greedy in list order, each point draws its own candidates from its id, so appending memories never moves existing points (a test pins the prefix). It keeps the margins, the keep-out boxes (title, back control, bottom zone, and the corner reserved for T5's "Agregar recuerdo", via the `action` slot of `MemoriesPlace`) and a minimum spacing while there is room, then falls back to the farthest candidate when crowded. A loose left-to-right time ordering was skipped: it would move existing points whenever one is added. Each orb fades in once its thumbnail loads (or fails, so none is lost; an already-complete image counts, which covers server-rendered images that finish before hydration), staggered by index up to 24 steps. Drift is a seeded CSS wobble (transform only, paused on hover and focus). Orbs are `data-magnetic="light"` buttons named "caption, date" (plus ", pendiente"); the cursor label is the caption cut to 28 characters and the Ctrl context is the date. Own pending orbs are dimmer with a "Pendiente" marker. Hover reveals a small round thumbnail.
  - **Viewer.** Radix Dialog mounted inside the stage (so the magnetic cursor still works), opening out of the orb's position in 200 ms ease-out (160 ms out), with the photo in a frame that reserves its aspect ratio, the caption, the Spanish date (`Intl`, UTC) and "Pendiente de aprobación" for pending ones. Esc, the close button or a press on the empty stage close it; focus is trapped while open and returns to the orb being viewed; Left and Right (and the on-screen chevrons) go to the previous and next memory, stopping at the ends. Reduced motion: only short fades, no drift, no stagger.
  - **Wiring.** `journey.tsx` renders `MemoriesSpace` (the container: `useMemories(listMemories)` calls the action when the place mounts), with the way back above the opaque place. T3 transitions are intact. `listMemories` is mocked in the journey test.
  - **Visual check.** Playwright (Chromium) against `next start` on :3001 at 1440x900 and 390x844, through a temporary harness page (deleted before the commit) with 26 fixture memories on public Cloudinary demo images: loading, the constellation assembling, hover (round thumbnail and cursor label), pending marker, the open viewer, next, Escape with focus back on the orb, and the empty, error and loading states. Shots in the session scratchpad `shots/t4-*`. The real database is not reachable yet (T6), so the production path (the action reading Neon) is covered by tests only.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (880 tests) and `pnpm build` pass; `/` stays static.
  - Open notes: the stage shows at most 300 orbs and the layout is best-effort when crowded. Tab walks every orb in list order (no roving tabindex).
  - Commit `64ebc6c`. RDD (medium; the slice budget was reached) was granted and approved with no findings; lineage `review-ac1140047005f1ef` acknowledged. Reviewed boundary: `64ebc6c`.
  - User feedback after T4 opened T3b (orb hover and the return portal), which runs before T5.

## T6 checklist (run only after the user authorizes remote operations)

1. As the owner (`DIRECT_URL`), run `prisma migrate deploy`. It creates the tables, `app_user` (no login) and the policies.
2. As the owner, run `ALTER ROLE app_user LOGIN PASSWORD '<generated secret>';` with SQL. The password never goes in the repo.
3. Build the pooled `app_user` URL (same host, `app_user` and the new password) and set it as `DATABASE_URL` in `.env.local` and Vercel. `DIRECT_URL` stays the owner's unpooled URL. The runtime guard throws if `DATABASE_URL` uses the owner.
4. Generate the session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and add it as `SESSION_SECRET` to `.env.local` and Vercel. The user does this, not an agent. Without it the gate still admits, but sets no session cookie.
5. Check with `app_user`: it reads only approved rows, inserts only pending rows under its own handle, and cannot update or delete.

## Next step

T3b: orb and portal polish. Then T5: upload. A form with photo, text and date, opened from the `action` slot of `MemoriesPlace` (bottom-right, already kept clear by the layout); a server-signed Cloudinary upload, then a `pending` row inserted under RLS as the visitor, with size, type and per-handle rate limits and a "pending approval" confirmation. Append the new memory to the client list so existing orbs stay put.
