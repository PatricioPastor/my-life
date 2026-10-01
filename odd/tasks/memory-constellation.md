# Memory constellation

- **Locator:** `odd/tasks/memory-constellation.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-constellation/tasks` (project `theduck`)
- **Branch:** `feat/memory-constellation` from `main` @ `165957c`
- **Builds on:** `odd/tasks/memory-orb.md`, the delivered memory orb, memories space and upload.

## Objective

Make the memories dimension feel alive and personal. Memories float and interact like a living constellation, and related ones (by date and place) drift together and connect as nodes. Each visitor gives their orb a color taken from their own photo. The upload works well on any screen, the location is exact, and on the home sky you can summon the memory orb to the cursor with R.

## User request (2026-10-01, summary)

1. **Exact location:** "La foto que uno comparte puede tener la ubicación exacta, prefiero eso."
2. **Upload modal:** "El scroll del modal para cargar la imagen está horrible."
3. **Mobile:** "La experiencia en mobile es bastante pete."
4. **Orb color:** the visitor picks their memory orb's color from related colors. Decision: the swatches come from the photo itself.
5. **Living constellation:** the points float, navigate and interact with each other. Clusters by date and place: related memories approach and connect like nodes, while everything still feels a little entropic.
6. **Dust and background:** fewer, more defined dust particles, so the orbs stay visible. The background gradient should move.
7. **Summon with R:** on the home sky, pressing R brings the memory orb to the mouse. The motion starts reluctantly, then approaches fast, and is precise and smooth.

## Decisions

- **Exact location (supersedes the approximate rule of `memory-orb` T5b and T5c):**
  - Still opt-in: the checkbox stays, and the copy no longer says "never the exact one".
  - Store the exact coordinates (`numeric(9,6)`) from the photo's EXIF or the Google Maps link.
  - Third parties never get exact coordinates: Nominatim still receives rounded values.
  - The client DTO gets only a coarse position (2 decimals) and the place name, which is enough for clustering. Exact coordinates stay server-side.
- **Orb color:** the swatches are extracted from the photo in the browser (canvas, 5–6 tones), then adjusted to glow on the dark void: a lightness and chroma floor in OKLCH. The chosen color is stored as `orb_color` (`#rrggbb`).
  - The server validates the format and the glow floor.
  - If no color is chosen, the server falls back to the photo's dominant color, adjusted the same way.
- **Delivery:** a single feature branch delivered at the end, the same as the previous feature, unless the user says otherwise.
- **Database rules (user, mandatory):** snake_case, RLS forced on every table, and column-level `INSERT` grants for `app_user` only.

## Constraints

- Public repository: never commit secrets. Agents never read `.env.local`.
- Remote operations need explicit user authorization: applying migrations and live checks.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev servers use port 3001, and a writer stops only its own PID.
- `/` stays static. Any file read with `fs` from a route must be trace-included (see the ENOENT postmortem in Engram).

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.

## Tasks

- [x] **T1 — Exact location.**
  - A migration widens `approx_*` into exact `latitude`/`longitude` columns. Name them in snake_case; keep or rename them as the writer judges cleaner, but keep the CHECKs.
  - Remove the rounding on storage, keeping the consent gate.
  - Update the copy and keep Nominatim on rounded input.
  - The DTO gains a coarse position and the place name.
- [x] **T2 — Upload modal and orb color.**
  - Rework the dialog so it no longer scrolls badly: a bottom sheet on phones, a two-column layout on desktop, a single scroller and a sticky action.
  - Add the color picker with swatches from the photo; store `orb_color`.
- [ ] **T3 — Living constellation.**
  - A force simulation: wander plus soft collisions, entropic but calm.
  - Similarity by date and place gives attraction springs and faint connecting lines between related nodes.
  - Orbs are tinted with `orb_color`.
  - Accessible DOM buttons stay; reduced motion gets a still layout.
- [ ] **T4 — Dust and moving background.** Fewer, crisper dust motes and a slowly drifting background gradient.
- [x] **T5 — Summon with R.**
  - On the home sky, R brings the memory orb to the cursor: a slow, reluctant start, a fast approach, and a precise settle.
  - It is ignored while typing, and has a reduced-motion fallback.
- [ ] **T6 — Mobile pass.** Audit every screen at 390x844 and 360x740 (onboarding, gate, sky, orb, memories, viewer, upload) and fix what's poor.
- [ ] **T7 — Deliver.**
  - Apply the migrations after authorization, run a live check, then the full checks and RDD.
  - Migrations to apply, in order, with `prisma migrate deploy` as the owner (`DIRECT_URL`), after the user authorizes:
    - `20261002000000_memory_exact_location` (T1): widens the position to `numeric(9,6)`, renames `approx_latitude`/`approx_longitude` to `latitude`/`longitude` and their three CHECKs, restates `app_user` INSERT on the two columns. Existing rows keep their 2-decimal values.
    - `20261002010000_memory_orb_color` (T2): adds `orb_color varchar(7)` (nullable) with the lowercase-hex CHECK `memories_orb_color_hex` and `app_user` INSERT on that column.
    - After both, check with read-only catalog queries: `memories` has no `approx_*` column, `latitude`/`longitude` are `numeric(9,6)`, the CHECKs carry the new names, `orb_color` exists, RLS is still enabled and forced, and `app_user` has column-level INSERT on exactly the earlier columns plus `latitude`, `longitude` and `orb_color` (no UPDATE or DELETE).
    - Live check: upload a geotagged photo with consent and confirm the stored position has 6 decimals, the client DTO only 2, and that Nominatim is called with 2 decimals; pick a swatch and confirm `orb_color`; open the dialog on a real phone.
  - Fast-forward main and push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, and `/` stays static.
- A geotagged photo stores its exact location only with consent, and the client never receives exact coordinates.
- The upload dialog never double-scrolls, and is comfortable at 360x740 and on desktop.
- Each memory orb shows its chosen color, and related memories visibly gather and connect.
- R summons the orb on the sky only, never while typing.

## Progress

- 2026-10-01: Document created from the user's feedback. Orb color swatches come from the photo (the user chose this).
- 2026-10-01: T1 and T2 done (route: delegated writer, 2+ non-trivial files and the preparatory reading; strict TDD, RED observed first, runner `pnpm test`). Commits: `c867dad` (T1) and the T2 commit that follows it on `feat/memory-constellation`.
  - **T1 decisions (supersede the approximate rule of `memory-orb` T5b and T5c):**
    - The position is stored exact, trimmed to 6 decimals (`numeric(9,6)`, about 10 cm), from the photo's EXIF GPS or from the Google Maps link, and only with consent (the checkbox is unchanged; no consent means no location, and the EXIF is not even decoded).
    - Validation stays: range, hemisphere refs, the 0,0 no-fix point (also after trimming).
    - Third parties never see more than 2 decimals: `nameOf`, the link resolver and `suggestPlace` round at the call site, and the Nominatim adapter still refuses anything that is not already rounded.
    - The client may now send the exact position to `suggestPlace` (the form's map link then points at the exact spot); the server validates it and rounds before geocoding. The pasted-link action returns the exact position, which the visitor pasted themselves.
    - DTO: `place: { lat, lng, name } | null`, `lat`/`lng` rounded to 2 decimals half away from zero, `name` may be null. The exact position and the source never reach the client. The viewer shows the name under the date, small and quiet.
    - Copy: "Guardamos dónde se sacó la foto para ubicar tu recuerdo en el universo."
    - Code: `approximateLocation` became `exactLocation`; `coordinates.ts` gained `roundTo`, `exactCoordinate` and `isValidPosition`; the fields are `latitude`/`longitude` end to end. A bug found by the tests: numbers under 1e-6 print as `1e-7`, which broke the decimal-string rounding, so `roundTo` scales those directly.
    - **Migration** `20261002000000_memory_exact_location`: hand-written, because `prisma migrate diff` turns a rename into DROP + ADD (it would lose rows and column privileges). It widens the type, renames the two columns in place and the three CHECKs (`memories_latitude_range`, `memories_longitude_range`, `memories_location_paired`), and restates the `app_user` INSERT grant. The migration lint now also checks `RENAME COLUMN` and `RENAME CONSTRAINT` targets for snake_case.
  - **T2 decisions:**
    - **Orb color** (`src/features/memories/orb-color.ts`, pure, shared by browser and server): `glowColor` lifts a tone in OKLCH to lightness at least 0.70 (at most 0.86 when it had to be lifted, to leave room for chroma) and chroma at least 0.08, keeping the hue; greys and black get the site's cool hue (250). The result is gamut-mapped to sRGB by lowering chroma at fixed lightness and hue (`oklchToSrgb`), and a pale tone steps its lightness down until the chroma floor fits. A tone that already glows comes back unchanged (idempotent). `isGlowColor` is the server's validation (floors with a 0.01 tolerance for 8-bit rounding). `chooseOrbColor`: the visitor's valid glowing color, else the Cloudinary dominant color lifted to glow, else the default `#8ab4ff`. Also `colorName` and `swatchNames` (simple Spanish names from hue and lightness, made unique with an ordinal), `rimColor` (neighbouring hue, +30 degrees) and `colorDistance` (OKLab).
    - **Palette extraction** (`ui/photo-palette.ts`): the picked photo is drawn on a canvas of at most 64 px, then median cut (split the box with the most spread, weighted by sqrt of its pixels, along its widest channel at the median, until 12 boxes). Each box average is lifted with `glowColor`, boxes are ordered by population and tones closer than 0.06 in OKLab are dropped, keeping at most 6, the dominant first. A photo the browser cannot draw (HEIC in most browsers) falls back to `ORB_PORTAL` lifted to glow, with the note "No pudimos leer los colores de esta foto. Elige uno de estos."
    - **Server:** `createMemory` takes an optional `orbColor` and stores `chooseOrbColor(...)`; the DTO always carries a valid `orbColor` (re-checked on the way out, so older rows with none and hand-edited rows are safe). The memories space tints each orb's core, halo and rim with it (`--pc`, `--rim` from `rimColor`); the `palette` prop of the space was removed (journey no longer passes it).
    - **Migration** `20261002010000_memory_orb_color`: `orb_color varchar(7)` nullable, CHECK `memories_orb_color_hex` (lowercase `#rrggbb`), `app_user` INSERT on that column only.
    - **UI:** a radiogroup of round swatches ("Color de tu orbe"), each named by hue and lightness, roving tabindex, arrow keys, Home and End move and select, plus a live orb preview in the memories-dimension style.
    - **Dialog layout:** the card has a fixed height (phones: the viewport minus the top safe area; desktop: `min(100%, 690px)`), so it never resizes when the swatches, the preview or the place suggestion appear. One scroll region (`overflow-y-auto overscroll-contain`) holds the fields; the header and the actions are outside it. The actions footer (submit, errors, confirmation) is always visible and pads for the bottom safe area. Phones: bottom sheet with a grab handle and a rise animation (reduced motion falls back to a fade). Desktop: two columns (photo, color and preview on the left; caption, date, place on the right) and the submit under the right column. The caption counter moved into the field's corner and the map link shares the status line, so 1280x720 fits.
  - **Checks:** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 121 files and 1608 tests passed, `pnpm build` ok with `/` still static.
  - **Visual check:** Playwright (Chromium) on :3001 against a temporary `/zz-harness` page (deleted before the commit; every action mocked, a generated PNG as the photo), at 1440x900, 1280x720, 390x844 and 360x740: the empty dialog, with a photo (swatches, preview and place suggestion), the place section expanded, the validation errors and the uploading state at 42%. Measured at each size: the card stays inside the viewport and keeps its height in every state, the page never scrolls, the submit is reachable (the element at its center is the button), and at 1440x900 and 1280x720 the single scroll region does not scroll at all; on both phone sizes only that one region scrolls. Shots in the session scratchpad `shots/c-a-*`.
  - **Open notes:** nothing here ran against the real services (Neon, Cloudinary, Nominatim): that is T7. The palette reader was only exercised in Chromium with a PNG; a real HEIC in Safari (which decodes it) and on Chrome (which does not) is for the live check. The two migrations were never applied; they were only linted. T2 landed as one commit because the picker and the new layout touch the same component and its tests.
- 2026-10-01: T5 done (route: delegated writer, isolated worktree `my-life-worktrees/summon-orb`, branch `feat/summon-orb`; trigger: 2+ non-trivial files; strict TDD, RED observed first).
  - **Curve.** `summonEase` in `src/features/orb/orb-summon.ts` is the exact CSS curve `cubic-bezier(0.7, 0, 0.2, 1)`, a pure function of elapsed time. About 7% of the way after a quarter of the time and 11% after 30% (it "costs to get going"), about 80% of the distance between 30% and 70% (the fast approach), 98.6% at 85% and a flat tangent at the end (no overshoot, no wobble: the curve never exceeds 1 and ends exactly at the target). `(0.8, 0, 0.1, 1)` was tried first and dropped: its peak speed was 6.7x the average and the flight felt abrupt; `(0.7, 0, 0.2, 1)` peaks at 4x. An expo in-out starts too flat (1.5% at a quarter, the orb looks stuck) and a spring cannot start slow by definition. Duration is 0.9 s up to 1.2 s, scaled linearly with the distance (full at 1400 px); it is fixed when the flight starts.
  - **Live retargeting.** Position is `from + (target - from) * ease(u)`, where `target` is the landing of the cursor read through a critically damped follower (closed form, 7 rad/s), so a cursor that moves mid-flight bends the path with continuous position and velocity (tested: a 360 px jump of the cursor changes the per-frame acceleration by less than 4 px/frame^2, the flight itself peaks at about 1.8). R again while it flies changes nothing (it is already following); R while parked starts a new flight from where it is.
  - **Landing.** NEXT to the cursor: one glow radius plus 16 px away, on the side that faces the screen center, clamped to the viewport margin and pushed out of the keep-out boxes (a few passes, the same clearance the wander uses). With the cursor dead center it picks the right side. On arrival the follower glides to rest on the cursor read at that instant, so there is no stop kick. In the browser the magnetic cursor captures the orb once it lands (it is about 60 px away), so it peeks right away; that capture is also what holds it parked.
  - **Park and resume.** It stays parked 4 s from arrival; hover, capture or a trip (`held` or `parked`) restarts the count. Then it blends back: `pos = from + (path - from) * smoothstep(v)` over 3 s (short way) to 4.5 s (whole screen), with `from` fixed at the parked spot, so it starts from rest and ends on the live seeded path with no jump (the wander itself resumes from rest through the existing rate easing). The seeded path is unchanged: it is never re-seeded, only blended into. The blend can cross a keep-out box on the way (a straight blend between two valid points).
  - **Edge cases.** Only on the sky (`interactive` and `active`): the gate, facets, memories and the portal never summon. Ignored while an `input`, `textarea`, `select` or `contenteditable` has focus, while a `[role=dialog]`, `[role=alertdialog]`, `[aria-modal]` or `dialog[open]` is in the DOM, and while the intro replays (the onboarding root now carries `data-blocks-shortcuts`); ignored with Ctrl, Meta or Alt, on `repeat` and while composing. Leaving the sky (the portal opens, a facet) cancels the summon where the orb is, with no jump: it blends back once it is free, so no stale summoned state survives a visit. With no pointer yet (touch only, or before the first move) it lands next to the viewport center: a visible answer is better than a dead key. Reduced motion: no flight; it fades out (squared, 150 ms), appears next to the cursor and fades in (200 ms); the return is a fade too, not a glide.
  - **Copy and analytics.** The orb Ctrl context reads "Deja un recuerdo en este universo. Pulsa R para llamarlo." (also the screen reader description). `memory_orb_summoned` joined the allow-list with no props; the journey tracks it once per accepted summon.
  - **Checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, with `/` still static. Visual check: Playwright on :3002 at 1440x900 with a fake clock stepped to 0, 300, 700 and 1200 ms, shots in the scratchpad `shots/c-c-*` (before, start, 30%, 70%, arrived next to the cursor, resuming, resumed). Software GL renders about 2 frames per second, so timing is judged from the tests and the fake clock, not from wall time. The reduced-motion path is covered by the unit tests only (no still).

## Next step

T3 (living constellation) and T4 (dust and background), then T6 (mobile pass) and T7. T5 is integrated (cherry-picked from `feat/summon-orb`; reviewed there).
