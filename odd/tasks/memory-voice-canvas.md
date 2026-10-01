# Memory voice and canvas

- **Locator:** `odd/tasks/memory-voice-canvas.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-voice-canvas/tasks` (project `theduck`)
- **Branch:** `feat/memory-voice-canvas` from `main` @ `05ed54e`
- **Builds on:** `odd/tasks/memory-orb.md` and `odd/tasks/memory-constellation.md`

## Objective

Memories can speak, and the memories space becomes a place you move through.
- A memory can be a photo, an audio clip, or both. The audio is recorded in the browser or uploaded as a file, and its orb "talks": it pulses and ripples with the voice.
- The memories space becomes a navigable canvas (pan and zoom).
- Opening a memory flies the camera to its orb instead of zooming a photo in a box. Up close, the orb becomes a glass sphere holding the photo, with the caption, date and place floating around it.

## User request (2026-10-01, verbatim)

- "Agregar la posibilidad de agregar un audio y que la preview sea un orbe parlanchín."
- "Lo ideal no es que la foto se zoomee, sino que yo me acerque al orbe."
- "En vez de mostrarse en un recuadro completo, podría ser un orbe como si tuviese un efecto glass."
- "Quiero que sea un canvas, que pueda moverme por ese espacio."

## Decisions

- **Photo and/or audio:** a memory needs at least one of them (the user chose this). The audio is recorded in the browser (MediaRecorder) or uploaded as a file.
- **Limits:** audio up to 2 minutes and 15 MB. Formats: webm/opus, ogg, mp3, m4a/mp4/aac and wav, delivered as a broadly playable transcode (e.g. mp3 or m4a) through signed URLs. The photo limits are unchanged, and so is the rate limit (5 memories per 24 h).
- **Microphone:** `Permissions-Policy` must allow `microphone=(self)`. It is denied today. Camera, geolocation and the rest stay denied.
- **Audio storage:** Cloudinary resource type `video` (which covers audio), delivery type `authenticated` and signed URLs, the same as the photos. Moderation is unchanged: everything starts `pending`.
- **Migrations are expand-only:** no renames and no drops. Production runs the old code until the deploy (lesson from the constellation delivery). Use new nullable columns and relaxed NOT NULLs, plus a CHECK that a memory has a photo or an audio. snake_case and RLS rules as always.
- **Navigation:** the memories space is an infinite-feeling canvas with a camera (x, y, zoom).
  - Drag to pan, wheel or pinch to zoom toward the pointer, with inertia. Keyboard: arrows pan, `+`/`-` zoom, `0` fits.
  - The physics world lives in world coordinates, with bounds that grow with the number of memories.
  - Dust and the void glows get depth parallax relative to the camera.
- **Approach, not zoom:** activating an orb flies the camera to it, slow then fast then settling, consistent with the summon curve. There the orb opens into the glass sphere view.
  - Esc, the back control or zooming out flies back.
  - The arrow keys and the on-screen controls fly to the previous or next memory in date order.
- **Glass orb:** a WebGL view for the focused orb only, holding the photo with refraction, fresnel rim, specular highlight and a subtle chromatic dispersion.
  - An audio-only memory has an empty glass with an inner light that is the voice.
  - Caption, date and place float around it, readable.
  - Keep a sensible fallback without WebGL.
- **Talking orb:** a Web Audio `AnalyserNode` drives the glow and a surface ripple while the audio plays. The upload form preview uses it too.
- **Reduced motion:**
  - camera moves cut with a fade, with no inertia;
  - the talking orb shows a gentle level glow, with no deformation.
- **Delivery:** a single feature branch delivered at the end, after the user's approval.

## DTO contract (both writers follow it)

`MemoryView` changes as follows:
- `thumbUrl` and `fullUrl` become `string | null`;
- `width` and `height` become `number | null` (null when there is no photo);
- it gains `audio: { url: string; durationMs: number } | null`, where `url` is a signed, playable transcode;
- everything else is unchanged: `id`, `caption`, `happenedOn`, `status`, `kind`, `takenAt`, `dominantColor`, `orbColor`, `place`.

The memory kind stays derivable: photo, audio, or both.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`. Remote operations need the user's explicit authorization.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev servers: port 3001 in the main directory, 3002 in the worktree. A writer stops only its own PID.
- `/` stays static. Keep review slices under about 1,800 changed lines (the RDD lens budget).

## TDD

Strict (global `CLAUDE.md`). Runner `pnpm test`.

## Tasks

- [ ] **T1 — Audio data and upload** (writer A, main directory).
  - Expand-only migration; the server signs, verifies and stores the audio.
  - The form records or uploads, previews with the talking orb, and allows photo and/or audio.
  - Microphone policy; the DTO contract above.
- [x] **T2 — Canvas, approach and glass orb** (writer B, worktree `../my-life-worktrees/canvas`, branch `feat/memory-canvas`).
  - Camera and gestures; world-space constellation; parallax.
  - The fly-to approach; the WebGL glass view (replacing the rectangular viewer); the talking orb, driven by `audio` from the DTO.
  - Built against the DTO contract with fixtures.
- [ ] **T3 — Integrate.** Merge `feat/memory-canvas`, run the full checks and RDD.
- [ ] **T4 — Mobile pass** for the canvas gestures, the glass view and recording.
- [ ] **T5 — Deliver.** Apply the migration after authorization, run a live check (photo, audio-only, both), then fast-forward main.

## Progress

- 2026-10-01: Document created. The user chose "photo and/or audio", recorded or uploaded.
- 2026-10-01: T2 done (route: delegated writer, isolated worktree `my-life-worktrees/canvas`, branch `feat/memory-canvas`; trigger: 2+ non-trivial files and the preparatory reading; strict TDD, RED observed first, runner `pnpm test`). Built against the DTO contract with fixtures; nothing here touches the audio server side.
  - **Camera** (`ui/camera.ts`, pure). `{ x, y, zoom }` with `x, y` the world point at the middle of the viewport, kept in a controller (not in React state). Zoom 0.35 to 3 (lower for a huge world, so it can always be fitted). Screen to world and back, zoom about a point (the point stays put), `fitBounds` with HUD padding (capped at 1.15 so a tiny constellation is not blown up), `focusCamera`, a soft edge (a drag may go up to 140 px past the world with growing resistance, then eases back) and `parallaxOffset`. The fly-to is the summon curve `cubic-bezier(0.7, 0, 0.2, 1)` (`summonEase`): center linear, zoom even in its logarithm, exact at both ends, 0.9 to 1.4 s scaled by the distance counted on screen (zoom included). Short moves (keys, double tap) use a 0.3 s ease-out.
  - **World.** The constellation simulation now runs in world space. `worldBounds(n, aspect)`: area is 55,000 px² per memory (at least 12), so each side grows with the square root of the count; the shape is the viewport shape at first sight (clamped 0.6 to 1.8), so a resize never reseeds. No keep-out boxes in the world: the HUD is fixed on screen and the camera simply fits the constellation clear of it. The first fit is measured on a throwaway copy of the simulation run to rest (the links pull clusters in), so the overview is as big as it can be.
  - **Gestures** (`ui/gestures.ts` pure reducers, `ui/camera-controller.ts` wiring). Drag to pan with inertia (decay 3.4/s, release speed capped at 4,500 px/s; a press that moves less than 6 px is still a tap, and the click that ends a real drag is swallowed); wheel zoom toward the pointer (a trackpad pinch arrives as ctrl + wheel and is stronger; per-event cap about x2); two-finger pinch (zoom by the finger distance ratio, the world point under the middle stays under it, which also pans); double click or double tap zooms x2 toward the point (not on an orb); keys while the space has focus: arrows pan, `+`/`=` and `-` zoom, `0` fits. The stage is a focusable `role="group"` with a label that names the keys, and has `touch-action: none`. The HUD (`[data-hud]`) and dialogs take their own input. An orb that takes keyboard focus off screen is brought into view.
  - **Placement.** One rAF loop (the constellation loop, which also advances the camera) writes `style.transform` of each orb (`translate3d` and a `scale` that grows slower than the zoom) and redraws the edge canvas through the camera; there is no React state per frame, and edges with both ends off screen are skipped. Dust layers follow the camera by 8%, 20% and 40% (the field wraps, so it is endless) and the three void glows by 6%, 10% and 14% (wrapper layers, so their CSS drift is untouched). The title, the "Universo" back control, the add control and the dialogs stay fixed.
  - **Approach** (`ui/approach.ts` pure state machine, `ui/use-approach.ts`). `idle` -> activate -> `flying` -> arrived -> `open` -> close -> `leaving` -> left -> `idle`; stepping from `open` or `flying` retargets and keeps the camera to return to (the one taken at the first activation); an orb activated while flying back is approached and the original camera is still the way home. Activating flies to the orb at zoom 2.4 with the orb at the glass anchor; the orb is held still for the flight and grows toward the glass as the camera comes in (its photo shows, its breath stops through `--focus`), then the glass opens. Esc (also mid-flight), the Cerrar control, a click on the empty stage or zooming out (a wheel away) fly back. Previous and next follow date order (day, then EXIF time, then id) with the arrow keys, small on-screen buttons and a swipe, and stop at the ends. Gestures are off from activation until the camera is home again. The magnetic cursor inert rule is unchanged: Radix hides the stage behind the dialog, and the orbs come back on close.
  - **Glass** (`ui/glass-view.tsx`, `glass-orb.tsx`, `glass-renderer.ts`; replaces the rectangular viewer, which is removed). A Radix dialog named by the caption (focus moves in, Esc closes, focus returns to the orb), with the caption in Gambarino and the date and place floating under the sphere. WebGL2 draws one full-screen triangle on a canvas 16% bigger than the sphere: the sphere normal `z = sqrt(1 - r^2)` drives a ball-lens lookup of the photo (magnified in the middle, folding toward the rim), a different scale per color channel for the chromatic dispersion, a fresnel rim, two specular lobes and a broad sheen, a thin inner shadow along the rim, and a faint tint and halo in the memory `orbColor`; the voice sends rings through the normal. An empty glass (audio only) is an inner light in `orbColor` with rings and a breathing idle. The photo is the `<img crossOrigin="anonymous" alt=caption>` that is also the texture source (one request; screen-reader only in WebGL mode). Fallback without WebGL2 (or a lost context, or a photo WebGL may not read): a CSS glass circle (radial gradients, a circular-clipped photo, a highlight and a rim) driven by `--glow` and `--warp`. The choice is `pickGlassMode` on the existing `probeRenderer`.
  - **Talking-orb interface.** `ui/voice-level.ts`: `useVoiceLevel(audioElement): () => number`, a stable reader of a smoothed 0..1 level (AnalyserNode RMS, quick attack and slow release, exactly 0 at rest; a synthetic speech-like level when there is no Web Audio). The glass reads it every frame (no React state). The graph is built on the first play (one `MediaElementSource` per element, in a WeakMap). To swap it for the other writer `audio-level.ts` / `ui/talking-orb.tsx`, replace the one `useVoiceLevel(audio)` call in `glass-view.tsx`; anything that returns a `() => number` fits. The play control is a real button (`aria-label` "Reproducir audio" / "Pausar audio" / "Audio no disponible", `aria-pressed`) with the clock; playback stops on close, on another memory and on unmount.
  - **Reduced motion.** Camera moves are a cut with a 110 ms fade out and a 140 ms fade in of the world, with no inertia, no ripple (only a gentle level glow, 0.45 of the level) and a still clock in the shader; the glass opens with a fade.
  - **Orbs.** Audio-only orbs have no photo (they are ready at once) and send a faint ring now and then (still under reduced motion); `data-voice` marks any memory with audio.
  - **DTO touch points for the merge.** `memory-view.ts` (nullable photo fields, `audio`, `MemoryAudio`), `list-memories.ts` (`audio: null` for now, with its test and `create-memory.test.ts`), and the fixtures in `add-memory.test.tsx`, `memories-space.test.tsx` and `mobile-layout.test.tsx`. The other writer server side replaces the `audio: null` mapping.
  - **Checks.** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 138 files and 1957 tests passed, `pnpm build` ok with `/` still static.
  - **Visual check.** Playwright (Chromium, software GL) on :3002 against a temporary `/zz-harness` page (deleted before the commits; 30 fixtures with generated SVG photos, audio-only, photo-only and both, four clusters, one pending, a generated WAV) at 1440x900 and 390x844, plus reduced motion at both sizes: the fitted overview, panned and zoomed, mid-flight (the orb grown toward the glass), the glass with a photo, the photo talking, the next memory, back on the overview, and the audio-only glass idle and talking. Shots in the session scratchpad `shots/v-b-*`. Software GL renders a few frames per second, so motion is judged from the tests and stills; the ripple rings are subtle in stills (the halo and inner light follow the level clearly).
  - **Open notes.** The production photo and audio URLs are signed Cloudinary URLs and must answer CORS (`Access-Control-Allow-Origin`), because both are loaded with `crossOrigin="anonymous"` (WebGL cannot read a tainted image, and a browser mutes audio routed through Web Audio without CORS): this is for the live check, and an image that fails CORS falls back to the CSS glass but then cannot load either. The glass tint, refraction strength and ring weights were tuned by eye on software GL, not on a real GPU. The first three commits add modules that the fourth wires in, so the type check is only expected to pass from the last commit.

## Next step

T1 (writer A) and T2 (writer B) in parallel.
