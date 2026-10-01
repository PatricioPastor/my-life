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

- [x] **T1 — Audio data and upload** (writer A, main directory).
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

- 2026-10-01: T1 done (route: delegated writer, 2+ non-trivial files and the preparatory reading; strict TDD, runner `pnpm test`, RED observed first on every group). Commits `9eae6e8` (server), `50b19e6` (recorder, level math, talking orb) and `d9e12f6` (form), each under about 1,800 changed lines. Branch `feat/memory-voice-canvas`; nothing pushed, the migration is written but NOT applied.
  - **Cloudinary facts (Context7, `/websites/cloudinary` and MDN `/mdn/content`).**
    - Audio is a `video` resource: `upload_parameters` ("Uploading audio files") posts it to `/v1_1/<cloud>/video/upload`, and `image_upload_api_reference` allows `type=authenticated` for it (`deleting_assets_tutorial` shows `resource_type: video, type: authenticated` for the delete). The signature rule is the one of T5 (every field but `file`, `cloud_name`, `resource_type`, `api_key`), so the same `signCloudinaryParams` signs it.
    - Admin API: `GET /resources/video/authenticated/<id>` (`admin_api`, `ts_how_can_i_get_the_size_or_dimensions_of_an_image_by_its_public_id`). The answer has `public_id`, `resource_type`, `type`, `format`, `bytes`, `duration` (seconds) and `audio` and `video` stream objects; `media_metadata=true` asks for the stream details. `is_audio` is NOT in the docs I could reach: the adapter uses it when present, otherwise "an `audio` stream and no `video` stream". To confirm in the live check.
    - Formats (`formats_supported_for_transformation`): upload takes AAC, AIFF, AMR, FLAC, M4A, MP3, OGG, OPUS and WAV; delivery covers AAC, AIFF, M4A, MP3, OGG and WAV (not OPUS or FLAC). MediaRecorder gives webm or mp4, which are video containers, hence `allowed_formats=webm,ogg,opus,mp3,m4a,mp4,aac,wav` plus the `is_audio` check, so a real video cannot pass as audio.
    - Delivery (`audio_optimization`, `delivery_url_signatures`, `control_access_to_media`): an extension or `f_<format>` converts the format on the fly, an authenticated asset only plays through a signed URL, and the signature covers `<transformation>/<version>/<public id>.<ext>` (SHA-1, first 8 characters). The playable URL is `https://res.cloudinary.com/<cloud>/video/authenticated/s--SIG--/f_mp3/<public id>`, signed over `f_mp3/<public id>`: mp3 plays on Chrome, Firefox, Safari and iOS, whatever was recorded. `control_access_to_media` says authenticated assets have no on-the-fly transformations, but the T7 live check of the photos showed signed transformed URLs answer 200, so the mp3 transcode should too: also for the live check.
    - Browser side (MDN): `MediaRecorder.isTypeSupported` exists, so the code never assumes a container. `pickRecorderMime` tries `audio/webm;codecs=opus` (Chrome, Firefox, Edge, recent Safari), then `audio/mp4` (older Safari and iOS record only that), `audio/ogg;codecs=opus`, `audio/webm`, and otherwise lets the browser choose. `getUserMedia` throws `NotAllowedError` for a refusal, and also when Permissions Policy blocks the microphone (why the header changed); `NotFoundError` is no microphone. `AudioContext.resume()` is needed under autoplay rules, and `createMediaElementSource` can wire an element only once.
  - **Migration `20261003000000_memory_audio` (expand-only, written by hand, lints pass).** Adds nullable `audio_public_id` (unique), `audio_format`, `audio_bytes`, `audio_duration_ms`, and drops NOT NULL on `public_id`, `width` and `height`. No rename, no drop. CHECKs: `memories_has_media` (a photo or an audio), `memories_photo_paired` (width and height exactly when there is a photo), `memories_audio_paired` (the four audio columns together), `memories_audio_duration_range` (1 to 125000 ms) and `memories_audio_bytes_range` (1 to 15 MiB). `GRANT INSERT` for `app_user` on exactly the four new columns; RLS untouched (still enabled and forced, same policies). The `media_kind` enum is not extended: the kind is derived (see the DTO). The Prisma schema and client follow (`public_id`, `width`, `height` optional).
  - **Server.** `prepareUpload({ photo, audio })` (only an explicit `true` counts; neither is `invalid`) signs one upload per asset: the photo as before, the audio as `my-life/memories/audio-<uuid>` with `allowed_formats` of audio, `overwrite=false` and `type=authenticated`. One HMAC ticket carries `h`, `pid?`, `aid?` and `exp` (strict key sets, at least one id, both inside our folder). The grant is `{ cloudName, photo, audio, ticket }`. `createMemory` reads each declared asset back through the port (`describe`/`describeAudio`, `destroy`/`destroyAudio`) and `verifyAudio` requires: audio (`is_audio`), resource type `video`, type `authenticated`, our folder and id, an allowed format, at most 15 MB and 2 minutes (plus 1 s of recorder drift), and takes duration, bytes and format from Cloudinary. Any failure, a failed validation or the rate limit destroys every uploaded asset (an asset reported missing is skipped); a duplicate id keeps them. Photo-or-audio is validated (`media_missing`), the photo metadata, color and location paths are unchanged, a location needs a photo with GPS or a Maps link, and an audio-only memory gets the visitor's glowing color or the default `#8ab4ff`. New failures: `audio_missing`, `audio_type`, `audio_too_large`, `audio_too_long`.
  - **DTO (as in the contract).** `thumbUrl`, `fullUrl`, `width`, `height` nullable; `audio: { url, durationMs } | null` with the signed mp3 URL; the original format, size and public id never leave the server. `kind` stays `"image"` (derived: a photo when `thumbUrl` is set, a voice when `audio` is). `memory-points` draws an audio-only orb as just the glow, and the old viewer hides the photo frame and shows a plain `<audio controls>` (T2 replaces it).
  - **Microphone policy.** `Permissions-Policy: camera=(), microphone=(self), geolocation=(), interest-cohort=()`; the test also forbids opening it to other origins.
  - **Recorder.** `recorderReducer` (pure): idle, requesting, recording, recorded, playing, with the cap clamp (2:00), the error kinds `denied`, `no_device`, `unsupported`, `failed` and file loading; `useAudioRecorder(env?)` is the side-effect shell over `getUserMedia` and `MediaRecorder` (seams: `getUserMedia`, `recorder`, `now`): it stops by itself at 2 minutes, names the take after its container, holds the clip as an object URL, and on unmount or discard stops the tracks, clears the timer and revokes the URL; an empty take is a failure, and a stream granted after the visitor gave up is released.
  - **Talking orb (reusable).** `ui/talking-orb.tsx`: `<TalkingOrb color level active size? reducedMotion? className? />`, where `level: () => number` returns 0 to 1 and is called once per frame while `active`. It writes `--lvl`, `--r1` and `--r2` straight to the element (no React render per frame), the core pulses with the level and two rings show the level from 140 ms and 300 ms ago (the voice seems to travel outward), it eases back to rest and stops its loop, and cancels the frame on unmount. Reduced motion (the prop or `prefers-reduced-motion`) has no rings and no scaling, only a brighter glow. `ui/use-audio-level.ts`: `useAudioLevel(source: HTMLMediaElement | MediaStream | null, active, env?)` returns a stable `() => number` over an `AnalyserNode` (an element goes element, analyser, speakers and is kept wired; a stream goes to the analyser only so the visitor never hears themselves; the context is made on first use, resumed, and closed on unmount). `ui/audio-level.ts` is the pure math: `byteRms`, `levelFromRms` (noise floor 0.006, full scale 0.3, square root), `smoothLevel` (70 ms attack, 240 ms release), `pushLevel`, `laggedLevels`. For a Cloudinary URL the `<audio>` needs `crossOrigin="anonymous"`, or the analyser hears silence.
  - **Form.** A "Foto" section (optional, with a "Quitar foto" control over the preview) and an "Audio" section (`audio-section.tsx`): Grabar with a timer against 2:00 and Detener, or Subir audio; listen with the talking orb, record again, remove. A refused microphone, no microphone and no MediaRecorder show a short Spanish message and keep the upload. Validation: "Agrega una foto o un audio.", type, 15 MB, 2 minutes (read with a throwaway `Audio` element; unknown lengths go to the server), "Detén la grabación antes de guardar.", plus the old caption and date rules. The orb color: swatches from the photo when there is one, otherwise the `ORB_PORTAL` swatches lifted to glow (`fallbackPalette`) with their own note. Uploads go one after the other (photo to `image/upload`, audio to `video/upload`) with one progress bar weighted by bytes. The dialog layout is kept (fixed card, one scroll region, sticky footer, phone sheet); the photo box is a little shorter so the desktop card still fits without scrolling. Analytics: `memory_audio_recorded` (no props, allow-listed) when a recording is saved.
  - **RED evidence.** Server batch: 107 failed and 344 passed across 13 files (missing exports and the new rules). Recorder and level math: the model, level, hook, `useAudioLevel` and `TalkingOrb` files could not import their modules. Form: 11 failed tests (validation, picker copy, form model) plus `audio-duration`, `audio-section` and `add-memory-audio` unresolved. GREEN after each implementation.
  - **Visual check.** Playwright (Chromium) on :3001 through a temporary `/harness-voice` page (deleted before the commit; no remote call: actions mocked, a synthesized microphone through the real MediaRecorder) at 1440x900 and 390x844. Shots in the session scratchpad `shots/v-a-*`: the empty form, recording with the timer, the recorded preview with the talking orb mid-pulse (`--lvl` above 0.6, ring visible), audio only with the portal swatches and a chosen one, photo plus audio, the validation errors, a wrong audio file, and the two-file upload. At 1440x900 the card fits with no scrolling in every state; on the phone the one scroll region scrolls as before; the audio box keeps its height in every state.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (2054 tests, 1767 before) and `pnpm build` pass; `/` stays static (`○`).
  - **Open notes.** (1) Nothing ran against the real services: `is_audio`, the `f_mp3` transcode on an authenticated asset and the Admin `duration` are for the live check (T5). (2) If the audio upload fails after the photo went up, the photo asset is an orphan (same chore as before: a periodic cleanup of unreferenced `my-life/memories/*`). (3) Recording and playback on a real iPhone (Safari records `audio/mp4`) are for T4. (4) A memory with a photo and an audio counts as one for the rate limit. (5) The Engram mirror `odd/memory-voice-canvas/tasks` is not updated by this writer.

## Next step

T1 is done. T2 (writer B) continues; then T3 integrates `feat/memory-canvas` and checks the DTO against the real form.
