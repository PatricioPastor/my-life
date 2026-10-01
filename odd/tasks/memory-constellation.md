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
- [x] **T3 — Living constellation.**
  - A force simulation: wander plus soft collisions, entropic but calm.
  - Similarity by date and place gives attraction springs and faint connecting lines between related nodes.
  - Orbs are tinted with `orb_color`.
  - Accessible DOM buttons stay; reduced motion gets a still layout.
- [x] **T4 — Dust and moving background.** Fewer, crisper dust motes and a slowly drifting background gradient.
- [x] **T5 — Summon with R.**
  - On the home sky, R brings the memory orb to the cursor: a slow, reluctant start, a fast approach, and a precise settle.
  - It is ignored while typing, and has a reduced-motion fallback.
- [x] **T6 — Mobile pass.** Audit every screen at 390x844 and 360x740 (onboarding, gate, sky, orb, memories, viewer, upload) and fix what's poor.
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
- 2026-10-01: T3 and T4 done (route: delegated writer, 2+ non-trivial files and the preparatory reading; strict TDD, RED observed first, runner `pnpm test`). Commits: `fe0c586` (T3) and the T4 commit that follows it on `feat/memory-constellation`.
  - **Similarity** (`ui/similarity.ts`, pure). Date: the same day is 1; one to seven days apart fades from 0.7 to 0.45; the same calendar month is a faint 0.2 (UTC day of `takenAt` when it parses, else `happenedOn`). Place: the same name (trimmed, case-insensitive) or within 1.5 km (the coarse 2-decimal grid makes "about 1 km" the adjacent cell) is 1; within 25 km is 0.5. The two combine as independent evidence, `1 - (1 - 0.85 date)(1 - 0.85 place)`, so sharing both beats either. Threshold 0.35: a shared week or a nearby town links on its own, a shared month alone does not. `buildEdges` scores every pair once per list change (O(n^2), about 45k pairs at 300 memories), then takes edges strongest first while both ends have room, so no node keeps more than 4 (deterministic ties by index).
  - **Forces** (`ui/constellation-sim.ts`, pure, fixed step 1/60 s, typed arrays). Nodes start at the seeded layout, at rest. Wander: two slow sinusoids per axis (periods 10 to 35 s), seeded by the memory id, 12 px/s^2. Collisions: a uniform grid of 96 px cells (counting sort, O(n + nearby pairs)); orbs keep 50 px apart (radius 20 + 20 + gap 10) with a soft push of 60 /s^2 per px of overlap, plus a faint personal space to 96 px (14 px/s^2) so unrelated orbs that pass close nudge each other apart. Springs on edges: 3.2 /s^2 per px with a rest length that shrinks from 170 px (weight 0.35) to 72 px (weight 1). Keep-outs (the existing boxes) and the viewport margins: a soft push inside a 36 px band, plus a hard projection so a center is never inside a box or past the margin. Damping 1.3 /s, speed cap 48 px/s. Pinned orbs get zero velocity and never move but still push the others. `settle()` (reduced motion): no wander, damping x3, cap x2.5, until nothing moves, at most 720 steps.
  - **Rendering** (`ui/constellation-loop.ts`, `ui/memory-points.tsx`). Orbs are still real buttons in list (date) order; each `li` is moved with `style.transform` from one rAF loop (never React state), drawn extrapolated by the leftover time so it is smooth at any refresh rate (at most 4 steps per frame, a longer stall is dropped). Edges: one canvas behind the orbs, hairline, alpha 0.34 x weight x (1 - length/340)^2, a gradient blending the two orb colors; a faint pulse travels along an edge every 18 to 46 s. Hover, focus or a pointer within 56 px (the stand-in for the magnet capture, which the place cannot observe) holds that orb, sets `data-link` (`self`, `near`, `far`) on every orb (CSS: neighbours brighten, the rest dim to 0.5) and eases the held orb's edges up and the others down. The viewer opens from the orb's current position. A new memory keeps the others where they are (the positions carry over by id; a resize reseeds). Paused while the tab is hidden; the place unmounting stops it. The CSS wobble of each orb stays at half amplitude as a small breath on top of the simulation.
  - **Performance.** Per frame: O(n + edges), no allocation but one gradient per visible edge. 600 steps of 300 memories run well inside a loose 3 s unit guard (a few tens of ms in practice). Edges are computed once per list change.
  - **Dust** (`ui/dust-field.ts`, `ui/dust-canvas.tsx`). The count is about 40% of before: area / 22,500, clamped to 36..60 on desktop (was 90..150) and at most 24 on a phone (was 60). Radii shrank to 0.5-0.9, 0.8-1.4 and 1.3-2.2 px, softness to 0.05, 0.2 and 0.4, and the sprite keeps a solid core to 88-72% of its radius with a sharp falloff; the drawn size is `radius x (1.15 + 1.2 x softness)` (was `1.6 + 3.4 x softness`). The depth layers and the pointer parallax are unchanged. Lowering alpha over an orb's halo was not done (the canvas does not know where the orbs are; it would couple the two).
  - **Background** (`ui/void-glows.ts`, `.mem-glow` in `globals.css`). Three very soft glows (violet and indigo, each with a faint orb-palette tint at the edge, alpha 0.10 to 0.16) drift on CSS transform-only animations of 71, 97 and 113 s with different negative delays, alternate direction, so the combined picture does not repeat. CSS is cheaper than the canvas: the layers are composited and cost nothing per frame in JS. The static violet wash under them was halved. Reduced motion (the hook, and the media query) freezes them.
  - **Checks.** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 1731 tests passed, `pnpm build` ok with `/` still static.
  - **Visual check.** Playwright (Chromium, software GL) on :3001 against a temporary `/zz-harness` page (deleted before the commits) with 30 fixture memories (a Palermo trip, a Bariloche trip, a Christmas week, five years of one cafe, ten unrelated) and generated SVG thumbnails, at 1440x900 and 390x844: the initial layout, after 9 s and 24 s (four clusters formed with edges), hover on a clustered orb (its links light, the rest dim), reduced motion (the settled layout with edges) and the void at two animation times. Shots in the session scratchpad `shots/c-b-*`. Software GL renders only a few frames per second, so motion is judged from the tests and stills.
  - **Open notes.** Orb color tints and the clusters were only seen on fixtures; the real data is T7's live check. The pointer proximity pin (56 px) is a stand-in for the magnetic cursor's capture, which does not reach the place. The unrelated-orbs glow flicker was left out on purpose (the personal-space nudge is the interaction).

- 2026-10-01: RDD for T1–T5 (all medium, no findings). The writer A range (2,941 lines) was split for the lens budget.
  - **Exact location** (`0110529..c867dad`): lineage `review-6753b97fb1286a31`, reviewed in a temporary worktree.
  - **Orb color and dialog** (`c867dad..30e97b4`): lineage `review-3d6019b844ff6aa1`.
  - **Summon with R**: lineage `review-cc5880da548ba84c`, reviewed in its own worktree, then cherry-picked as `6bb972c`. The only conflict was in this document; both entries were kept.
  - **Constellation, dust and void** (`6bb972c..fc67ac9`): lineage `review-e362fdd380a641d2`.
  - All approved and acknowledged. Integrated checks after the cherry-pick: lint, typecheck, 1665 tests, build `○`. Reviewed boundary: `fc67ac9`.
- 2026-10-01: T6 done (route: delegated writer, 2+ non-trivial files and the preparatory audit; strict TDD, RED observed first, runner `pnpm test`). Mobile pass over onboarding, gate, sky, orb, facet places, reader, portal, memories space, viewer and add sheet.
  - **Method.** Playwright Chromium with mobile emulation (`isMobile`, touch, DPR 3, a Pixel UA) at 390x844, 360x740 and 844x390, a test whitelist handle through the process environment, and a temporary `/zz-harness` page (deleted before the commits) with 16 fixture memories on inline SVG thumbnails for the memories space. Safe areas were emulated with CDP `Emulation.setSafeAreaInsetsOverride` (top 47, bottom 34) and the virtual keyboard by replacing `window.visualViewport` with a fake whose height shrinks by 300 px (plus a grey block drawn over that area), because Chromium cannot open a real one. Each screen's interactive elements were listed (size, offscreen, overlaps, horizontal scroll) as well as looked at. Shots live in the session scratchpad `shots/c-d-before-*` and `c-d-after-*`.
  - **Findings.**

    | # | Sev | Screen | Issue (evidence) | Result |
    |---|-----|--------|------------------|--------|
    | 1 | high | Gate | The form sits at 58% of the height: with the keyboard open the field and the submit are behind it (`c-d-before-p390-gate-keyboard`). | Fixed: the form rides 16 px above the keyboard (`c-d-after-p390-gate-keyboard`). |
    | 2 | high | Add sheet | With the keyboard open the caption, date and submit are hidden: the sheet keeps the full height (`c-d-before-p390-add-keyboard`). | Fixed: the sheet shrinks onto the visible area, the footer stays above the keyboard and the focused field is scrolled into view (`c-d-after-p390-add-keyboard`). |
    | 3 | high | Gate, sky, facet, memories, viewer | The page draws under the notch and the home indicator (`viewport-fit=cover`) but the pinned controls used fixed px: the name mark (40 px), the back buttons (28 px), Cerrar (20 px) and Ver intro (28 px) fall under a 47 px status bar (`c-d-before-p390-*-inset`). | Fixed: each offset is `max(its old value, env(safe-area-inset-*) + a little)`; the facet title and list and the memories title and action add the inset (`c-d-after-p390-*-inset`). Desktop is unchanged (inset 0). |
    | 4 | medium | Sky | The memory orb is an unnamed glow on touch: its label only exists in the Ctrl cursor (`c-d-before-p390-sky-inset`). | Fixed: a small "Agregar recuerdo" tag rides beside the orb, on the side with room, only where there is no hover (`c-d-after-p390-sky-inset`). |
    | 5 | medium | Gate | On phones the label and the field sit on the tunnel's glyphs and are hard to read (`c-d-before-p390-gate-inset`). | Fixed: below 640 px the form starts at 68% instead of 58%, under the ring (`c-d-after-p390-gate-inset`). |
    | 6 | medium | Facet place | A 112 px meta column takes a third of the width, so every title wraps in two lines (`c-d-before-p390-facet-inset`). | Fixed: below `md` the meta sits over the title (`c-d-after-p390-facet-inset`). |
    | 7 | medium | Entry (landscape) | The reader is about 560 px tall: the title is clipped at the top and the page buttons fall off the screen (`c-d-before-land-facet-2-entry`; the listing reported both buttons offscreen). | Fixed: short viewports (max-height 520 px) compact the title, the body and the gaps, and the column scrolls with safe centering (`c-d-after-p390-land-entry`). |
    | 8 | medium | Facet place (landscape) | The 94 px title lies on top of the list (`c-d-before-land-facet-1`). | Fixed: short viewports shrink the title and tighten the list (top 76 px, 440 px wide, rows of 56 px) (`c-d-after-p390-land-facet`). |
    | 9 | medium | Memories | "Agregar recuerdo" is 40 px tall (below 44). | Fixed: `h-11`. |
    | 10 | low | Memories | Orbs keep drifting under the finger (the hover hold ignored touch). | Fixed: a finger holds the orb it is on, and lets go when it lifts. |
    | 11 | low | Viewer | No swipe between memories on a phone. | Fixed: a horizontal swipe (56 px, more horizontal than vertical) turns the page; the arrows remain. |
    | 12 | low | Memories | Orb hit areas (44 px boxes) overlap a little where two orbs are closer than 44 px. | Deferred: the simulation keeps 50 px apart in motion; the still reduced layout and the seeded start can be closer. Not worth a layout change. |

  - **Checked and fine.** Onboarding (greeting, phrases, CTA, story reader, progress, Saltar, hardware step) already pads with `--page-pad` and `--bottom-pad`, uses `dvh`, has no hover-only action and 48 px controls. No horizontal scroll anywhere. Every interactive element is at least 44x44 except the one fixed above (listing at 390, 360 and landscape). Facet stars are 48 px with always visible labels. `/` has no rubber banding (`overscroll-behavior: none`). WebGL is capped at DPR 1.5 (sky and tunnel), the dust and the constellation edges at 2, the dust is at most 24 motes on a phone, and the sky pauses when hidden. Reduced motion: the memories space, the viewer and the add sheet were run with it and look the same, with the still layout. Landscape: gate, sky and memories were fine; the two screens above were not.
  - **Decisions.** Keyboard: phones keep the layout viewport still and only shrink the visual one, so `useKeyboardInset` (pure `keyboardInset(layoutHeight, visualViewport)`, ignoring anything under 80 px, which is a collapsing toolbar) feeds the gate and the sheet, instead of `interactive-widget`, which would also change the `svh` stage. The orb's label is CSS-gated with `[@media(hover:hover)_and_(pointer:fine)]:hidden`, so desktop never shows it. Short-viewport rules use `[@media(max-height:520px)]` rather than orientation, so a small desktop window benefits too.
  - **RED evidence.** `keyboard-inset.test.ts` failed (module missing). `gate-screen.test.tsx` "lifts the form above the keyboard" and "keeps the form where it is" failed (no `data-gate-form`). `mobile-layout.test.tsx` failed 4 of 4 (no `env(safe-area-inset-*)` on the pinned controls), then the stacked meta and the landscape facet test. `add-memory.test.tsx` failed for the keyboard padding, the 44 px control (`h-10`) and `scrollIntoView`. `orb.test.tsx` failed 2 (no tag). `memories-place.test.tsx` failed the touch hold (`data-link` stayed `idle`) and the swipe. `reader.test.tsx` failed the landscape classes. GREEN after each implementation.
  - **Checks.** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 130 files and 1767 tests passed, `pnpm build` ok with `/` still static.
  - **Open notes.** The keyboard and the safe areas were emulated (a fake visual viewport and CDP insets) in Chromium only, not seen on a real phone: that belongs to T7's live check, iOS Safari especially, which resizes the visual viewport differently. The tag beside the orb can sit near a facet label, because the orb's keep-out boxes do not include it; it flips sides at the edge.

- 2026-10-01 (T7), Live check: with the user's authorization ("Sí, ambas") the two migrations were applied to Neon `main`, then a read-only catalog check as the owner and a temporary vitest harness (outside the committed code, deleted afterwards; `jpeg-js` and `piexifjs` in the scratchpad) ran the real modules against Cloudinary, Neon as `app_user` and Nominatim, with one 64x48 JPEG carrying EXIF GPS for Plaza de Mayo (-34.6083, -58.3712). All checks passed.

  **Catalog (owner, read-only):**
  - `memories` has RLS enabled and forced.
  - `latitude` and `longitude` are `numeric(9,6)`; no `approx_*` column remains; `orb_color` is `varchar(7)`, nullable.
  - CHECKs present: `memories_latitude_range`, `memories_longitude_range`, `memories_location_paired`, `memories_orb_color_hex`, plus `memories_dominant_color_hex`, `memories_location_source_paired` and `memories_place_name_needs_location`.
  - `app_user` has table-level `SELECT` only. Column `INSERT` on exactly 18 columns: `bytes`, `caption`, `dominant_color`, `format`, `handle`, `happened_on`, `height`, `kind`, `latitude`, `location_source`, `longitude`, `metadata`, `orb_color`, `palette`, `place_name`, `public_id`, `taken_at`, `width`. None on `id`, `status` or `created_at`; no UPDATE or DELETE.
  - All five migrations are recorded as finished, none rolled back.

  | # | Check | Result | Evidence |
  |---|-------|--------|----------|
  | 1 | Catalog | PASS | As listed above. |
  | 2 | Signed upload | PASS | `prepareUpload` fields answered 200, type `authenticated`, id `my-life/memories/smoke-<uuid>`. |
  | 3 | Exact location stored | PASS | Row `latitude` -34.608300, `longitude` -58.371200 (equal to the EXIF at 6 decimals), `location_source = photo`, `place_name` "Monserrat, Buenos Aires". The instrumented Nominatim fetch ran once, with `lat=-34.61&lon=-58.37` only. |
  | 4 | DTO | PASS | `place` is `{ lat: -34.61, lng: -58.37, name }`; no exact coordinate string anywhere in the DTO JSON; `orbColor` `#ff645a` equals the swatch `extractPalette` gave for the image's colors, equals the stored `orb_color`, and passes `isGlowColor`. |
  | 5 | `orbColor` fallback | PASS | `chooseOrbColor("#112233", "#dc2829")` returned `#ff645a` (the lifted dominant color); with no dominant color it returns the default `#8ab4ff`. |
  | 6 | Delivery | PASS | Signed thumbnail (`image/png`) and full (`image/jpeg`) URLs 200; no `Exif` or `GPS` bytes in either, and `piexif.load` of the full image has an empty GPS IFD. Unsigned thumbnail, full and bare `authenticated` URLs and a bad signature: 401; `/upload/` URLs: 404. |
  | 7 | Cleanup | PASS | The asset is destroyed (Admin API answers 404); `smoke_test` rows are 0 (re-checked after the harness was deleted); `git status` is clean. |

  - **Checks:** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 130 files and 1767 tests passed, `pnpm build` ok with `/` still static (`○`).
  - **Not exercised:** the browser flow, the swatch picker on a real photo and a real phone (keyboard, safe areas, iOS Safari), HEIC, and Google short links.

## Next step

T7 (deliver): apply the two migrations after the user authorizes, a live check (including the keyboard and the safe areas on a real phone), then fast-forward main. T1 to T6 are done.
