# Memory player and mobile

- **Locator:** `odd/tasks/memory-player-mobile.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-player-mobile/tasks` (project `theduck`). Pending while the Engram server is disconnected.
- **Branch:** `feat/memory-player-mobile` from `main` @ `bffc704`

## Objective

Make the audio memory a real player, make the text under the glass readable, make mobile clean and accessible, let a visitor contribute a memory related to the one they are looking at, and keep the exact place with its street address.

## User request (2026-10-02, verbatim, with two screenshots)

"https://ui.elevenlabs.io/ Al orbe de audio. Le falta mejorar la experiencia del reproductor. Pondría el play en el centro, pondría como una especie de filtro o algo para que mejore el contraste y mostraria la barra de frecuencias pasar. El orbe, que expanda particulas mientras más fuerte sea el volumen. Tambien, poder ajustar la cantidad de volumen. Cosas basicas, pero funcionales. Abajo el texto queda como que muy comprimido y si escribo, no se ve un carajo. Y en mobile, es muy mala la experiencia. el botón de agregar recuerdo, lo pondría arriba, pero con un más y palabra "Contribuir". Despues, la interfaz está muy confusa. Sería increible, que el botón de contribuir tambien esté ahi, pero que ya, por ejemplo, la fecha, sea la misma y que tenga como una relación con ese orbe. Para que como te dije, se vayan haciendo clusters. Quiero que del google maps o la imagen GPS, tome el valor exacto y dirección. [screenshot] El orbe no está centrado en mobile. Mejorar la experiencia gral en mobile de accesibilidad y todo, vamos."

Screenshots:

- Desktop: the play button hangs off the bottom rim of the sphere, with "15:32" beside it. The caption below is a large serif title squeezed between the previous and next arrows. "Agregar recuerdo" sits bottom-right.
- Mobile (about 400 px wide): the sphere sits visibly left of center.

## Decisions

- **ElevenLabs UI is a reference, not a dependency.**
  - Its `Orb` needs `three`, `@react-three/fiber` and `@react-three/drei` (Context7 `/elevenlabs/ui`, orb.mdx). We already own a WebGL lens and a Web Audio level hook, so we take the pattern and leave the library:
    - a centered play;
    - frequency bars from an `AnalyserNode`;
    - an orb that reacts to output volume;
    - a scrubber.
  - Its `BarVisualizer` takes a bar count, minimum and maximum height, and center alignment. Its `AudioScrubber` is a waveform you can seek.
- **Player:**
  - The play/pause button sits at the center of the sphere, over a contrast scrim: a radial darkening inside the sphere, stronger while paused, lighter while playing.
  - Live frequency bars move while it plays.
  - A seekable progress bar shows elapsed and total time.
  - A volume control goes through a Web Audio `GainNode`, because iOS Safari ignores `HTMLMediaElement.volume`. It falls back to the element's volume where Web Audio is unavailable.
  - Every control works by keyboard and screen reader. The audio route is same-origin, so `createMediaElementSource` hits no CORS problem.
- **Volume particles:** the louder the audio, the more particles the orb throws off and the faster they go. They take the orb color, stop when paused, and are off under `prefers-reduced-motion`.
- **Text under the glass:**
  - It stays readable at any caption length and never overflows the viewport.
  - The title steps down in size for long captions and is clamped to a few lines, with an expand that reveals the full text in a scrollable panel.
  - Previous/next must not squeeze the text on narrow screens.
- **"+ Contribuir":**
  - Replaces "Agregar recuerdo" and moves to the top of the screen, at every size.
  - It also appears in the glass view on a memory. From there, the form opens with that memory's date (and its place, when it has one) prefilled and editable, and the new memory is stored as related to it.
  - Related memories get a strong edge in the constellation, so they cluster. The new orb spawns near its parent.
  - Chosen by me, the user can change it: the relation is stored explicitly (`related_memory_id`), not inferred from the shared date alone.
- **Exact place and address:**
  - The place is geocoded from the exact position (the photo's GPS or the Google Maps link) at street level, no longer from a position rounded to 2 decimals.
  - The street address (road and number, then locality) is stored as `place_address` and shown under the memory, beside the place name. A Maps link keeps its own label as the name, for example "UOCRA".
  - The location checkbox copy must say plainly that the exact place and its address will be visible to the people who can enter.
  - Exact coordinates still never go to the client; the address is the visible form.
- **Mobile:**
  - Fix the off-center sphere.
  - Declutter the HUD.
  - Touch targets at least 44 px, visible focus, correct labels, safe areas, and reduced motion respected.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`.
- Remote operations need the user's authorization: migrations, live checks against Neon or Cloudinary, and any backfill.
- Migrations are expand-only: the code live before the deploy must keep working.
- Every new column follows the project rules: snake_case mapping, RLS on every table, column-level grants for `app_user`, and the migration and schema lints green.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- The dev server runs on port 3001 or 3002; stop only your own PID, never `taskkill /IM node.exe`.
- Visual checks use a temporary harness page that is never committed. Delete it, then `rm -rf .next/dev/types`.
- `/` stays static.
- Review slices stay under about 1,800 changed lines (the lens budget broke at about 2,800).
- About 400 changed lines per task is a planning heuristic only.

## TDD

Strict (project setting, as in every earlier feature). Runner `pnpm test` (Vitest, jsdom). RED, then GREEN, then REFACTOR, with the observed RED recorded.

## Delivery

- **Forecast:** about 2,700 authored lines, over the 400-line budget.
- **Strategy:** the same as every earlier feature, one feature branch with work-unit commits. After review and the user's approval, `main` is fast-forwarded and pushed. RDD runs per commit slice from the last reviewed boundary.

## Tasks

- [x] **T1 — Player** (`6c98741`). The play button moves to the center of the sphere, over the contrast scrim. Add:
  - live frequency bars;
  - a seekable progress bar with elapsed and total time;
  - a volume control (`GainNode`, with an element fallback);
  - keyboard and screen-reader support.

  Route: delegated writer. Trigger: 2+ non-trivial files (`glass-view.tsx`, `use-audio-level.ts`, new player modules, CSS).
- [x] **T2 — Volume particles** (`13891a1`). The orb throws off particles whose rate and speed follow the live level. They use the orb color, stop when paused, and turn off under reduced motion. Route: the same writer as T1.
- [ ] **T3 — Readable text.**
  - The caption block is bounded to the viewport, with the title stepping down for long text.
  - Clamp with an expand into a scrollable panel.
  - Previous/next are placed so they never squeeze the text.
  - `glassLayout` reserves the real space the text needs.

  Route: delegated writer.
- [ ] **T4 — Mobile and accessibility.**
  - Find and fix the off-center sphere, verified at 360, 390 and 412 px wide.
  - Make "+ Contribuir" the top-bar control at every size.
  - Declutter the HUD.
  - Run an accessibility pass: targets, focus, labels, safe areas, reduced motion.

  Route: the same writer as T3.
- [ ] **T5 — Contribute from a memory.**
  - "+ Contribuir" in the glass view opens the form with the date (and place) prefilled.
  - Store `related_memory_id` (expand-only migration with RLS, a column grant and a policy that the related memory is approved and visible).
  - A strong edge for related memories, and the new orb spawns near its parent.

  Route: delegated writer.
- [ ] **T6 — Exact place and address.**
  - Geocode the exact position at street level.
  - Compose and store `place_address` (expand-only migration).
  - Show it.
  - Update the consent copy.

  Route: the same writer as T5.
- [ ] **T7 — Deliver.**
  - RDD per slice.
  - With the user's authorization:
    - apply the migrations;
    - push;
    - live-check the relation, the address and the RLS;
    - optionally backfill addresses for existing memories that have exact coordinates.

## Acceptance

- An audio memory shows a centered play over a readable scrim, with moving bars, a scrubber that seeks, and a volume that changes loudness on iOS too. Particles grow with loudness.
- A 140-character caption is fully readable on a 360 px wide screen and never overflows.
- The sphere is centered (±1 px) at 360, 390 and 412 px wide.
- "+ Contribuir" is at the top. From a memory, it prefills the date and links the new memory, which then clusters with its parent.
- A memory placed from a photo GPS or a Maps link shows its street address.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. `/` stays static.

## Progress

- 2026-10-02: Document created after a read-only mapping of the player, caption, form, place pipeline, constellation and mobile layout.
- 2026-10-02: The user, going offline, authorized the whole delivery in advance: "Aplica todo lo que tengas que aplicar y revisa todo lo que vayas a revisar, me voy a dormir" and "seguí laburando". Recorded scope:
  - apply this feature's migrations;
  - grant each RDD review consent for this feature's candidates;
  - run the live checks with cleanup;
  - fast-forward and push `main` once every check is green.

  Anything outside this feature still needs the user.

- 2026-10-02 — **T1 done** (`6c98741`, route: delegated writer, trigger: 2+ non-trivial files).
  - **What changed.**
    - `GlassVoice` moved to `glass-voice.tsx`. The play button is 64 px at the sphere's center over a round contrast scrim (`.mem-glass-scrim`, a radial gradient that fades out before its own edge; opacity only; lighter while playing).
    - Frequency bars are 28 mirrored bars (`frequency-bars.tsx`, `audio-bars.ts`) drawn under the play, inside the lower sphere, driven by one rAF loop that writes `scaleY`, with a calm baseline and still under reduced motion.
    - Progress is a native range input (`audio-scrubber.tsx`): a drag seeks on release, a key press seeks at once, and `aria-valuetext` reads "3:12 de 15:32".
    - Volume (`volume-control.tsx`): a mute toggle plus a 0-100 slider. It is kept for the page session and in localStorage (try/catch) by `player-model.ts`.
    - `use-audio-level.ts` gained `useAudioGraph`: one analyser feeds level and spectrum, and a `GainNode` sits after it (the bars show the voice, not the knob). Before the graph exists, or without Web Audio, `element.volume` stands in. `useAudioLevel` is now a thin wrapper, so the form's talking orb is unchanged.
    - Space and K toggle playback inside the open glass. Sliders own their arrows, and a focused button keeps Space.
    - A pointer-down on the controls does not reach the dialog's swipe.
  - **Layout.** Bars sit at 0.25-0.37 of the diameter below the center. The controls row sits under the sphere (rim + 4 px, 48 px tall), so the caption offset (+64) and `glassLayout` are unchanged.
  - **TDD.**
    - RED, `audio-bars.test.ts` (11) and `player-model.test.ts` (18): the module was missing.
    - RED, `use-audio-level.test.tsx`: 10 of 20 failed.
    - RED, `glass-view.test.tsx`: 25 of 126 failed.
    - GREEN afterwards: 11, 18, 20 and 126.
  - **Checks.**
    - `pnpm lint`: clean.
    - `pnpm typecheck`: clean.
    - `pnpm test`: 173 files, 2837 tests passed.
    - `pnpm build`: `/` stays `○`.
  - **Visual.**
    - Playwright (Chromium, SwiftShader WebGL) on a temporary harness (deleted) at 390x844 @2x, 1440x900 and 360x740 @2x.
    - Audio-only and photo+audio (bright synthetic photo), paused and playing; seek by click works.
    - Reduced motion at 390: bars hold the baseline.
    - There is no horizontal overflow, and the sphere is centered.
  - **Open concerns.**
    - Pre-existing, for T3 and T4: on a short desktop (1440x900) the guest "Entrar al universo" link overlaps the views line of the caption.
    - On a 360 px screen the progress track is about 140 px (the volume slider drops to 48 px under 380 px).
- 2026-10-02 — **T2 done** (`13891a1`, route: delegated writer).
  - **What changed.**
    - `orb-particles.ts` holds the pure pool: 160 particles as typed arrays, with emission rate and speed from the level (nothing under a 0.05 hiss), drag, a fade, swap-remove, and a 50 ms step clamp.
    - `particle-canvas.tsx` is a 2D canvas 2.6 diameters wide, drawn above the sphere with `pointer-events: none` and additive blending in `memory.orbColor`. DPR is capped at 2 and `GlassView` mounts it only for audio memories.
    - Its loop runs only while the voice plays or particles are in flight, and it stops while the tab is hidden or the glass is closed.
    - Under reduced motion the canvas is not rendered.
    - `GlassVoice` reports `onPlaying`, and `GlassView` passes it as `emitting`.
  - **TDD.**
    - RED, `orb-particles.test.ts` and `particle-canvas.test.tsx`: the modules were missing.
    - RED, `glass-view.test.tsx`: 2 of 133 failed.
    - GREEN afterwards: 18, 18 and 133.
  - **Checks.**
    - `pnpm lint`: clean.
    - `pnpm typecheck`: clean.
    - `pnpm test`: 175 files, 2880 tests passed.
    - `pnpm build`: `/` stays `○`.
  - **Visual.** At 1440x900 (orange) and 390x844 (green) the particles are visible but quiet, and tinted with the orb color.

## Next step

T3 (readable text) with a delegated writer. T3 and T4 also own the pre-existing overlap of "Entrar al universo" with the caption on short desktops.
