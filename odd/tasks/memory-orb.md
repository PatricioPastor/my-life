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
- [x] **T3b — Orb and portal polish (user feedback, 2026-10-01).**
  - Hover: remove the amber backdrop the sky paints around a captured target, because it dulls the orb.
  - A better hover animation: the orb zooms in and turns into a more realistic window onto the memories dimension (dark void, dust and round orbs inside, a lens-like rim).
  - The way back from the memories place runs through the portal too, faster (about half the trip).
  - Bug seen in the T4 shots: while the viewer dialog is open, the orb behind it keeps the cursor captured and its label shows over the dialog.
- [x] **T5 — Upload.**
  - Form: photo, text and date.
  - A server-signed Cloudinary upload; the server verifies the asset, then inserts a `pending` row under RLS as the visitor.
  - Size, type and per-handle rate limits.
  - A "pending approval" confirmation.
- [x] **T5b — Photo metadata and location privacy (user request, 2026-10-01).**
  - Close the leak: the untransformed original keeps its EXIF, GPS included, and the thumbnail URL exposed the public id.
  - Store each photo's metadata for later features: kind (`media_kind`, `image` only for now), format, bytes, taken date, dominant color, palette and a whitelisted EXIF subset.
  - GPS only behind an opt-in checkbox ("Guardar desde dónde fue", unchecked by default); only an approximate location (2 decimals, about 1 km) is stored. The exact coordinates are never stored, logged or sent to the client.
  - New offline-generated migration with column-level `INSERT` grants; RLS untouched. DTO gains `kind`, `takenAt`, `dominantColor` only.
- [ ] **T5c — Suggested place with a Google Maps override (user request, 2026-10-01).**
  - User: "Creo que en función al GPS te recomiende la ubicación, pero si ves que está mal, setear una que consideres."
  - When a photo is picked, read its GPS in the browser, round it, and suggest the place by name with a link to verify it on the map.
  - If the place is wrong, or the photo has no GPS, the visitor pastes a Google Maps link instead.
  - The copy reads "where the photo was taken", never the visitor's own location. The location is still approximate and only stored with consent.
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

- 2026-10-01: T3b done (route: delegated writer, 2+ non-trivial files; strict TDD, RED observed first on every new behavior).
  - **The amber source.** It was not the focus FX (`uFocus*`): the orb's cursor id maps to no anchor, so `focusIndexFor` is -1 and the dim never starts. It was the sky's cursor light, the "lamp" (`uPointerOn`): while the reticle holds the orb the real pointer sits on it, and the lamp brightens and pushes the ember gas right behind the orb. Proved by pixel crops: with `uPointerOn` forced to 0 the amber backdrop vanished. Fix: a peeking orb shields its surroundings (`uOrbLens.zw`, from the pure `orbUniforms`): the lamp is attenuated (`lamp *= 1 - shield`) and the gas thins by up to 80% within about 1.35 lens radii, fading out by 2.6. Facet stars are untouched (their focus path and halos are unchanged).
  - **Peek.** One 0..1 value (`stepPeek`, pure): an exponential approach, tau 0.10 s in and 0.14 s out (about 90% at 250 ms, settled in about 450 ms), snap on the last 0.2%, always continuing from the current value, so re-hovering mid-reverse never jumps. Reduced motion: an even 0.2 s linear crossfade and no zoom. The zoom scale is `peekScale`: 2.0 at most, shrunk so the lens plus 8 px of air never reaches a keep-out box or the screen edge, never below 1, continuous in position. The orb button grows with the lens (`--orb-d`, `--orb-zoom`), so the cursor's frame hugs the window.
  - **The window.** Drawn in the sky shader inside a smooth sphere (radius 0.9 R, up to 1.8 R): the near-black void with a faint violet cast, three layers of round motes with pointer parallax and a refraction toward the rim, two tiny orbs in the orb palette, a fresnel rim, a chromatic fringe (the existing `uOrbFringe`, kept subtle), a specular and a faint bounce light. Not dithered, so it reads smoother than the halftone around it; the cost applies only to the lens pixels. A stale hover or focus (the button is removed with no mouseleave while the portal opens) used to survive the round trip; it is now cleared when the button goes away.
  - **Return portal.** New screen `orbReturn` and event `orbReturned`: `memories` + `back` runs the same tunnel (orb palette) at about half the trip: 850 ms plus a 550 ms linger (500 ms fade), against 1700 plus 1300 outbound (constants in `portal-timing.ts`). It opens out of the orb's spot over the still-mounted memories (380 ms), the sky is unpaused the moment the return starts so it is already painting when the tunnel fades, the orb is parked (no peek) and fades back in, and the way back cannot be pressed twice. The facet back control is unchanged. Reduced motion: no tunnel; the memories fade out over the sky in 300 ms.
  - **Viewer bug.** The cursor now skips targets under an `inert` or `aria-hidden="true"` ancestor (it also watches those attributes), so the orbs and the way back that Radix hides behind the modal can neither capture nor label; they come back on close. Verified live: with the viewer open the reticle stays free and no label shows.
  - **Visual check.** Playwright (Chromium, software WebGL) on :3001 at 1440x900 and 390x844, a test handle through the process env; the temporary harness page for the viewer was deleted. Shots in the session scratchpad `shots/t3b-*`: `before` and `after` hover crops, return frames, the viewer open. Software GL renders about 2 frames per second and a screenshot takes seconds, so the mid-peek and mid-tunnel frames could not be sampled at known times: timing is judged from the tests and the constants, and the look from stills.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (942 tests) and `pnpm build` pass; `/` stays static.
  - Open notes: the peek and return timings are tuned by constants, not by eye on a real GPU; the lens is dim on small phones; the Radix `aria-hidden` the cursor relies on is a library behavior, covered by a `MemoriesPlace` test.
  - Commits `14a91f1`, `43d5058` and `3cec5e7`. RDD (medium; the slice budget was reached) was granted and approved with no findings; lineage `review-6fa9a66d9785d78e` acknowledged. Reviewed boundary: `3cec5e7`.

- 2026-10-01: T5 done (route: delegated writer, 2+ non-trivial files; strict TDD, RED observed first on every new module).
  - **Flow.** (1) `prepareUpload()`: needs a session; missing Cloudinary config or `SESSION_SECRET` is `unavailable`; the per-handle rate limit (5 memories per rolling 24 h, any status, through the new `countRecentBy` on the port, run in `withVisitor`) gives `rate_limited`; otherwise the server picks `my-life/memories/<uuid>`, signs `allowed_formats`, `overwrite=false`, `public_id` and `timestamp` (SHA-256) and returns the signed fields, the cloud name and an upload ticket. (2) The browser posts the file and those fields straight to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` by XHR, with progress and an abort tied to closing the form. (3) `createMemory({ ticket, caption, happenedOn })` verifies the ticket, reads the asset back through the `CloudinaryAssets` port, validates, re-checks the rate limit and inserts a `pending` row under RLS, returning the T4 DTO. The photo never goes through a server action (Next.js caps action bodies at 1 MB by default), only the ticket and the text.
  - **Cloudinary facts checked with Context7** (docs `authentication_signatures`, `image_upload_api_reference`, `folder_modes`, `admin_api`, `response_signatures`): sign every POST field except `file`, `cloud_name`, `resource_type` and `api_key`, as `name=value` pairs sorted by name and joined with `&`, then append the API secret and hash. Cloudinary accepts SHA-1 and SHA-256 digests by default, so no account setting is needed (limiting an account to SHA-256 only is a support request). The documented vectors (secret `abcd`; `timestamp=1315060510` gives SHA-1 `a21ad0f6...`, and the `eager`/`public_id`/`timestamp` string gives `bfd09f95...`) are pinned in a test, and SHA-256 is computed over the same strings. Folders: `folder` is legacy fixed-folder mode only and `asset_folder` is dynamic mode only, so the path rides in the signed `public_id` itself, which works in both modes (in dynamic mode the Console shows the asset at the root, which is cosmetic). Admin API "get resource" is `GET /v1_1/<cloud>/resources/image/upload/<public_id>` with basic auth and returns `public_id`, `resource_type`, `type`, `format`, `bytes`, `width`, `height`; delete is `DELETE /resources/image/upload` with `public_ids[]` and `invalidate`.
  - **Security choices.** Ticket: HMAC-SHA256 with `SESSION_SECRET` over `{ h, pid, exp }` (15 minutes), constant-time compare, strict payload, domain-separated so a session cookie never verifies as a ticket; it must match the session handle. The public id is chosen by the server and signed with `overwrite=false`, so a signature that outlives the ticket cannot swap the photo after approval. Server-side verification: the asset exists, is an `image` of delivery type `upload`, its public id equals the ticket's and sits in our folder, its format is allowed and its bytes are at most 10 MB; width and height come from Cloudinary, never the client. Any failure after the ticket check destroys the asset (validation errors, wrong type or size, rate limit, an unreadable asset), except a duplicate `public_id` (the asset belongs to the existing memory) and an insert that failed in an unknown way (it may have committed). Secrets are server-only: the API secret is only ever the basic-auth header of the Admin API adapter (`server-only`), errors carry status codes and error names, never bodies, and each failure logs one line with no PII. Dates: a visitor ahead of UTC can already be on tomorrow, so the server accepts any date that is "today" somewhere (now plus 14 h).
  - **UI.** `MemoriesSpace` owns the add control: the place `action` slot now also takes a function that receives the stage, so the Radix dialog mounts inside it and the magnetic cursor keeps working. Photo picker with drag and drop (the hint shows on fine pointers only), a preview or just the file name when the browser cannot draw it (HEIC), a caption with a live code-point counter, and a date input from 1900-01-01 to the visitor local today. Button states "Guardar recuerdo", "Subiendo... 42%", "Guardando...", then "Listo. Tu recuerdo quedó pendiente de aprobación."; the new memory is appended at the end of the list as a pending orb the moment it is saved, and the dialog closes after 1.6 s. Errors are linked with `aria-describedby`; Escape and the close button do nothing while saving; focus returns to the control; Radix hides the stage behind the dialog (`aria-hidden`), which the T3b cursor fix respects (tested). Open and close reuse the viewer 200 ms ease-out (160 ms out, fades only under reduced motion). `memory_submitted` joined the analytics allow-list with no props, tracked on success only. On phones the control sits above the title instead of beside it.
  - **Visual check.** Playwright (Chromium) on :3001 at 1440x900 and 390x844 through a temporary `/zz-harness` page (deleted before the commit) with all three actions mocked and fixture images as inline SVG, so nothing left the machine: the place with the control, the empty form, the preview with the fields filled, all validation errors, the rate-limit error, the uploading state at 42%, the success message, and the new pending orb with focus back on the control. Shots in the session scratchpad `shots/t5-*`.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (1065 tests) and `pnpm build` pass; `/` stays static.
  - Open notes: the real upload, signature and Admin API calls have not run yet (T6, after authorization). SHA-256 is our default; if Cloudinary rejects it, flip the default in `cloudinary-signature.ts` to `sha1`. A visitor who closes the form between the Cloudinary upload and `createMemory` leaves an orphan asset with no row; a periodic cleanup of unreferenced `my-life/memories/*` assets is a later chore.
  - Commits `ac7d44c` (server) and `8de8deb` (form). RDD (medium; the slice budget was reached) was granted and approved with no findings; lineage `review-98c89caf022da9f8` acknowledged. Reviewed boundary: `b404a18`.

- 2026-10-01: T5b done (route: delegated writer, 2+ non-trivial files; strict TDD, RED observed first).
  - **The leak.** Cloudinary strips metadata from transformed deliveries by default, but the untransformed original keeps it, GPS included, and an `upload`-type URL is public: dropping the transformation from our thumbnail URL fetched the original. Even a transformed copy can keep it (`fl_keep_iptc` delivers the metadata intact) when the URL can be edited. Docs: `image_optimization` (Default optimizations > Metadata stripping) and `user_generated_content_upload` (Strip metadata).
  - **The fix: delivery type `authenticated`, no account setting.** Authenticated assets "cannot be accessed without some form of authentication" (`upload_parameters`, Delivery types); delivery URLs need a `/s--SIGNATURE--/` component that covers the transformation, and for authenticated assets the signature stays mandatory even for derived images (`control_access_to_media`, "Protect delivery and transformations"). Signature: first 8 characters of the URL-safe base64 SHA-1 of `<transformation>/<public id><API secret>` (`delivery_url_signatures`, "Manually create a signed delivery URL"); the doc vector (secret `abcd`, `c_fill,w_300,h_250/e_grayscale/sample-authenticated.png` gives `s--iDy_JeBq--`) is pinned in `cloudinary-url.test.ts`. Cloudinary accepts SHA-1 and SHA-256 by default. So a URL with the transformation removed no longer verifies, and the server-side Admin API (basic auth) still reads the original's EXIF. Options not chosen: `private` (derived versions stay public and arbitrary transformations, such as `fl_keep_iptc`, can be requested), strict transformations (an account setting) and an incoming `fl_force_strip` transformation (it would strip the metadata we want to read).
  - **Wiring.** The signed upload params now include `type=authenticated` (SDKs send it as a form field to `/image/upload`; `upload_parameters` and `image_upload_api_reference`). `verifyAsset` requires type `authenticated`, the Admin adapter uses `/resources/image/authenticated/<id>` for describe and `DELETE /resources/image/authenticated` for destroy (`admin_api`, `GET /resources/:resource_type/:type/:public_id` and `DELETE /resources/:resource_type/:type`), and `cloudinaryUrl(cloud, id, transform, apiSecret)` builds `https://res.cloudinary.com/<cloud>/image/authenticated/s--SIG--/<transform>/<id>`. The secret only goes into the hash. `list-memories` and `create-memory` take `cloudinary: { cloudName, apiSecret }`.
  - **Extraction.** The signed upload also sends `media_metadata=true` and `colors=true` (`semantic_data_extraction`, `image_upload_api_reference`), and `createMemory` reads the asset back through the Admin API with `?media_metadata=true&colors=true` (`admin_api`, "Get details of a single resource"). The response key is `image_metadata` in the documented upload answer; the adapter also accepts `media_metadata`. `colors` is `[["#RRGGBB", share], ...]`. The pure `photo-details.ts` maps it to a typed value: `kind`, `format`, `bytes`, `takenAt` (EXIF `DateTimeOriginal`, plus `OffsetTimeOriginal` when valid, otherwise read as UTC; null when absent or unparseable), `dominantColor` (`#rrggbb`), `palette` (top 5 with shares), `metadata` (whitelist: Make, Model, LensModel, ISO, FNumber, ExposureTime, FocalLength, Orientation, DateTimeOriginal, OffsetTimeOriginal, ImageWidth/Height, ExifImageWidth/Height; never GPS, serials, owner or author names) and the approximate location.
  - **Consent and rounding.** `createMemory` receives `shareLocation: boolean`; only an explicit `true` counts. With it and valid EXIF GPS (degrees/minutes/seconds with hemisphere refs, comma, rational or array forms, or signed decimals; minutes and seconds below 60; latitude within 90 and longitude within 180; the 0,0 no-fix position is rejected), the server stores `approx_latitude` and `approx_longitude` rounded to 2 decimals (half away from zero, decimal-exact). Otherwise both are null. `approximateLocation` is the only code that sees the exact values; nothing is logged. The migration adds CHECKs (range, both-or-neither) as a second line. The form checkbox is unchecked by default, with helper text linked by `aria-describedby`.
  - **Schema and grants.** Migration `20261001120000_memory_photo_details` (generated offline with `prisma migrate diff`, then hand-edited): enum `media_kind`; columns `kind` (default `image`), `format`, `bytes`, `taken_at`, `dominant_color`, `palette` (jsonb, default `[]`), `metadata` (jsonb, default `{}`), `approx_latitude` and `approx_longitude` (numeric(5,2)); CHECK constraints; `GRANT INSERT` on exactly those nine columns to `app_user`. No UPDATE, DELETE or PUBLIC grant, and RLS is untouched (still enabled and forced). `migration-lint` now also checks added columns for snake_case, refuses `DISABLE`/`NO FORCE` RLS, grants to PUBLIC, `UPDATE`/`DELETE`/`ALL` grants, and an INSERT grant on `id`, `status` or `created_at`.
  - **DTO.** `MemoryView` gains `kind`, `takenAt` (ISO string or null) and `dominantColor`; the location, `metadata` and `palette` are not sent. No visual change.
  - **RED evidence.** First run of the leak-fix tests: 37 failed (signed URL builder, `verifyAsset`, Admin paths, `type=authenticated`). First run of the metadata tests: `photo-details.test.ts` could not import its module, plus 33 failing tests (migration missing, new params, `createPending` fields, DTO fields, the checkbox). GREEN after implementation.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (1167 tests) and `pnpm build` pass; `/` stays static.
  - Open notes: the exact string Cloudinary uses for GPS values in `image_metadata` is not shown in the docs, so the parser accepts the common forms; T6's smoke test must upload a geotagged photo and check the stored coordinates. Assets uploaded before this change (none exist yet) would be of type `upload` and be refused. `app_user` can read the new columns through its table-wide `SELECT`; the server never maps them to the client.
  - Commits `ab76523` (leak fix) and `db8b54e` (metadata). RDD (medium; the slice budget was reached) was granted and approved with no findings; lineage `review-e2c45abe22876e38` acknowledged. Reviewed boundary: `0be05e6`.
  - User clarification after T5b: the location means where the photo was taken. It already comes from the photo's EXIF GPS, never from the browser (`geolocation=()` is denied in `Permissions-Policy`), but the copy "Guardar desde dónde fue" reads like the visitor's own location. The user asked for a suggested place from the photo's GPS that can be corrected with a Google Maps link, which opened T5c.

## T6 checklist (run only after the user authorizes remote operations)

Progress:
- 2026-10-01, step 1 done: the user loaded `DIRECT_URL` and asked to run the migration. `pnpm prisma migrate deploy` applied `20261001000000_init` to database `main` on the Neon host.
- Verified with read-only catalog queries as the owner:
  - `memories` has RLS enabled and forced; `_prisma_migrations` has it enabled only.
  - The `memories_select` and `memories_insert` policies are `TO app_user`.
  - `app_user` has `rolcanlogin=false` and `rolbypassrls=false`.
  - `app_user` has column-level `INSERT` on the six visitor columns only, plus `SELECT`.
  - All columns are snake_case.
  - `neondb_owner` has `rolbypassrls=true`, which confirms why the runtime must not use it.
- Note: the database is named `main`, not `neondb`, so `DATABASE_URL` must end in `/main`.

1. As the owner (`DIRECT_URL`), run `prisma migrate deploy`. It creates the tables, `app_user` (no login) and the policies.
2. As the owner, run `ALTER ROLE app_user LOGIN PASSWORD '<generated secret>';` with SQL. The password never goes in the repo.
3. Build the pooled `app_user` URL (same host, `app_user` and the new password) and set it as `DATABASE_URL` in `.env.local` and Vercel. `DIRECT_URL` stays the owner's unpooled URL. The runtime guard throws if `DATABASE_URL` uses the owner.
4. Generate the session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and add it as `SESSION_SECRET` to `.env.local` and Vercel. The user does this, not an agent. Without it the gate still admits, but sets no session cookie.
5. Check with `app_user`: it reads only approved rows, inserts only pending rows under its own handle, and cannot update or delete.
6. Cloudinary (the user does this; an agent never touches the account or `.env.local`):
   - Create or verify the account and note the cloud name, API key and API secret from the Console (Settings, API Keys).
   - Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to `.env.local` and to Vercel (Production and Preview). The secret is server-only; never prefix any of them with `NEXT_PUBLIC_`.
   - Signature algorithm: no setting is needed, because Cloudinary accepts SHA-1 and SHA-256 by default and the code signs with SHA-256. Do not restrict the account to SHA-1 only.
   - Check that signed uploads are allowed (the default) and that nothing in the account blocks HEIC/HEIF.
   - Dynamic folder mode needs no setting: the photos keep the path in their public id.
7. Apply the T5b migration `20261001120000_memory_photo_details` with `prisma migrate deploy` (as the owner, `DIRECT_URL`) after the user authorizes. Then check with read-only catalog queries: the nine new columns exist and are snake_case, `memories` still has RLS enabled and forced, and `app_user` has column-level `INSERT` on the six original columns plus the nine new ones, and no `UPDATE`/`DELETE`.
8. Cloudinary account setting for T5b: none needed (authenticated delivery and signed URLs work with the default settings). Remaining risk to confirm in the smoke test: the account must not have "Strict transformations" or other restrictions that block the signed `f_auto,q_auto,...` URLs, and signed delivery URLs use SHA-1 (accepted by default). Do not limit the account to SHA-256 only for URLs: our URL signatures are SHA-1 (the documented vector).
9. End-to-end smoke test, once the user authorizes remote operations and steps 1 to 6 are done: run the app against the real services, sign in with a whitelisted handle, open the memories place and use Agregar recuerdo with a small JPG, a caption and a date. Expect the "Listo..." message and a dimmer pending orb. Then check: the asset is of type `authenticated` and its unsigned or transformation-free URL (`/image/authenticated/<id>` without a signature, and `/image/upload/<id>`) answers 401/404; the signed thumbnail and full URLs load; with a geotagged JPG, the row has `approx_latitude` and `approx_longitude` with 2 decimals only when the checkbox was ticked and null when not, `taken_at`, `dominant_color`, `palette` and a `metadata` with no GPS, serial or owner fields; a row with `status = 'pending'` and Cloudinary width and height in `memories`; the asset `my-life/memories/<uuid>` in Cloudinary; `UPDATE memories SET status = 'approved'` makes the orb normal on reload; a sixth memory within 24 h answers with the rate-limit message; a GIF or a file over 10 MB is refused in the form; and a signed upload replayed after the first one is refused by Cloudinary (`overwrite=false`).

## Next step

T6: remote setup, which needs the user explicit authorization first: migrate Neon and create `app_user` (steps 1 to 5), apply the T5b migration (step 7), set the Cloudinary and session variables (steps 4 and 6), and run the end-to-end smoke test (step 9). Then T7: deliver (full checks, fast-forward main after the user approves).
