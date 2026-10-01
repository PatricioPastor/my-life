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
- [ ] **T2 — Canvas, approach and glass orb** (writer B, worktree `../my-life-worktrees/canvas`, branch `feat/memory-canvas`).
  - Camera and gestures; world-space constellation; parallax.
  - The fly-to approach; the WebGL glass view (replacing the rectangular viewer); the talking orb, driven by `audio` from the DTO.
  - Built against the DTO contract with fixtures.
- [ ] **T3 — Integrate.** Merge `feat/memory-canvas`, run the full checks and RDD.
- [ ] **T4 — Mobile pass** for the canvas gestures, the glass view and recording.
- [ ] **T5 — Deliver.** Apply the migration after authorization, run a live check (photo, audio-only, both), then fast-forward main.

## Progress

- 2026-10-01: Document created. The user chose "photo and/or audio", recorded or uploaded.

## Next step

T1 (writer A) and T2 (writer B) in parallel.
