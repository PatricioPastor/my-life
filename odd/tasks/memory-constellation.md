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

- [ ] **T1 — Exact location.**
  - A migration widens `approx_*` into exact `latitude`/`longitude` columns. Name them in snake_case; keep or rename them as the writer judges cleaner, but keep the CHECKs.
  - Remove the rounding on storage, keeping the consent gate.
  - Update the copy and keep Nominatim on rounded input.
  - The DTO gains a coarse position and the place name.
- [ ] **T2 — Upload modal and orb color.**
  - Rework the dialog so it no longer scrolls badly: a bottom sheet on phones, a two-column layout on desktop, a single scroller and a sticky action.
  - Add the color picker with swatches from the photo; store `orb_color`.
- [ ] **T3 — Living constellation.**
  - A force simulation: wander plus soft collisions, entropic but calm.
  - Similarity by date and place gives attraction springs and faint connecting lines between related nodes.
  - Orbs are tinted with `orb_color`.
  - Accessible DOM buttons stay; reduced motion gets a still layout.
- [ ] **T4 — Dust and moving background.** Fewer, crisper dust motes and a slowly drifting background gradient.
- [ ] **T5 — Summon with R.**
  - On the home sky, R brings the memory orb to the cursor: a slow, reluctant start, a fast approach, and a precise settle.
  - It is ignored while typing, and has a reduced-motion fallback.
- [ ] **T6 — Mobile pass.** Audit every screen at 390x844 and 360x740 (onboarding, gate, sky, orb, memories, viewer, upload) and fix what's poor.
- [ ] **T7 — Deliver.**
  - Apply the migrations after authorization, run a live check, then the full checks and RDD.
  - Fast-forward main and push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, and `/` stays static.
- A geotagged photo stores its exact location only with consent, and the client never receives exact coordinates.
- The upload dialog never double-scrolls, and is comfortable at 360x740 and on desktop.
- Each memory orb shows its chosen color, and related memories visibly gather and connect.
- R summons the orb on the sky only, never while typing.

## Progress

- 2026-10-01: Document created from the user's feedback. Orb color swatches come from the photo (the user chose this).

## Next step

T1 and T2 (writer A), with T5 in parallel in an isolated worktree (writer C).
