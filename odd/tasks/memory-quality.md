# Memory quality pass and long audio

- **Locator:** `odd/tasks/memory-quality.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-quality/tasks` (project `theduck`; pending while the Engram server is disconnected)
- **Branch:** `feat/memory-quality` from `main` @ `739542c`
- **Builds on:** `odd/tasks/memory-voice-canvas.md`

## Objective

Raise the quality of the memories dimension to a premium bar, and let audio memories run up to one hour.

## User feedback (2026-10-01, verbatim, with screenshots)

- "Quiero poder subir audios de hasta 1 hora, no quiero que se limite."
- **First render while approaching an orb:** "se ve así, de muy mala calidad y muy muy feo". The orb shows a blurry, upscaled photo.
- **Glass view:** "se ve como muy mal, pierde bastante calidad y además parece que el fondo que tiene, tiene overflow hidden porque se ve recortado por un cuadrado". The user circled square-clipped halo edges around the sphere. A harsh white specular blob sits on the photo.
- "La palabra Recuerdos puede desaparecer después de 2 segundos o hacerse mucho más chiquita." In the glass view it also collides with the caption.
- **Leaving the glass view:** "Cuando salís de la imagen, queda recontra bugueada". After closing, the screen shows:
  - the focused orb still rendered as a small photo sphere;
  - most other orbs missing;
  - a large white shape clipped at the bottom-left, likely the title.
- "Es muchísimo más mejorable la calidad en todo, vamos, sé crítico."

## Decisions

- **Long audio:** up to 60 minutes.
  - **Size cap:** set by the Cloudinary plan's maximum video/audio file size, verified in the docs. The default target is 100 MB, enough for 60 min of compressed audio (mp3, m4a or webm/opus). Uncompressed WAV is accepted only while it fits the cap, and the UI says so.
  - **Large files:** Cloudinary chunked upload where the docs require it. The audio is transcoded to a playable format at upload time (eager or async) instead of on the fly, because on-the-fly transformation is unsuitable for long or large videos and audio.
  - **Safari and iOS seeking:** playback must support byte ranges. Use Cloudinary range support if available; otherwise a Next route handler proxies the signed audio with `Range` support.
  - **Database:** the limits are relaxed by an expand-safe migration that drops and re-adds the CHECKs with wider bounds.
  - **Recorder:** the cap rises to 60 min. The UI shows elapsed time and size, and warns as it nears the cap.
- **"Recuerdos" title:** on arrival it shows large, then after about 2 s it shrinks into a small HUD label near the way back (a FLIP-style transform, ease-out). It is hidden while the glass view is open, so it never collides with the caption. Reduced motion uses a crossfade.
- **Image quality:** resolution follows the on-screen size.
  - The canvas orbs and the approach request the Cloudinary transform that matches the displayed diameter × DPR, stepping thumb → medium → full and crossfading as each loads. Nothing is ever shown upscaled beyond about 1.25×.
  - The glass texture uses the full image with mipmaps, trilinear and anisotropic filtering, and correct color handling.
  - The lens is less magnifying (no mushy center), and the specular is a subtle, physically plausible highlight, not a white blob.
  - The halo and glow never clip: the canvas has enough margin, or the halo is drawn outside the canvas in CSS.
- **Exit:** closing the glass restores the exact previous state: camera, orbs, edges, loops, title and HUD. It is covered by regression tests reproducing the reported sequence.
- **Quality bar:** a critical review of the whole memories experience (overview, approach, glass, exit, add dialog, orb in the sky), using the `impeccable` critique and polish references. Fix every high and medium finding.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`. Remote operations need the user's authorization.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev servers: port 3001 in the main directory, 3002 in the worktree. A writer stops only its own PID.
- `/` stays static. Migrations are expand-only. Keep review slices under about 1,800 changed lines.

## TDD

Strict (global `CLAUDE.md`). Runner `pnpm test`.

## Tasks

- [x] **T1 — Long audio (up to 60 min)** (writer A, worktree `../my-life-worktrees/long-audio`, branch `feat/long-audio`). Done 2026-10-01; commits in Progress. Open item: `glass-view.tsx` must use `useAudioReadiness` (T3).
- [ ] **T2 — Visual quality and bugs** (writer B, main directory).
  - The exit bug.
  - Resolution-aware images and the glass rebuild (texture quality, lens, specular, no clipping).
  - The title behavior.
  - The critical pass.
- [ ] **T3 — Integrate and review.**
- [ ] **T4 — Deliver.**
  - Apply the migration after authorization: `prisma/migrations/20261004000000_memory_long_audio` (T1). It drops and re-adds the two audio range checks in one `ALTER TABLE`, with bounds of 3,605,000 ms and 2,000,000,000 bytes; no column, grant or policy changes. Expand-safe: the old code's rows (125,000 ms, 15 MB) are inside the new bounds. Apply it before the deploy, so the new code never meets the old checks.
  - Optional server env var `MEMORY_MAX_AUDIO_BYTES` (a whole number of bytes, read server-side only; default 100,000,000; capped at 2,000,000,000). Do not set it unless the Cloudinary plan allows more.
  - Live check: a long audio (e.g. 20–60 min of compressed audio), Safari range behavior, image quality at zoom.
  - Fast-forward main after approval.

## Progress

- 2026-10-01: Document created from the user's critical feedback.
- 2026-10-01: **T1 done** (delegated writer, isolated worktree `my-life-worktrees/long-audio`, branch `feat/long-audio`; main merged in for hotfix `eec19d4`). Commits: `18a1605` limits and migration, `a8c615b` eager params, `1abd925` chunked upload, `2f18f71` audio route, `3e850b5` recorder. Checks: `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 154 files / 2404 tests pass, `pnpm build` ok (`/` stays `○`, `/api/memories/[id]/audio` is `ƒ`). No remote operations were made (no Cloudinary, no Neon); the migration is generated, not applied.
  - **Cloudinary facts** (Context7 `/websites/cloudinary`, checked 2026-10-01):
    - *Size and chunking.* Files over 100 MB must be uploaded in chunks through the API (413 otherwise); the total allowed "depends on your plan and account configuration" and is not tabulated in the docs retrieved, so 100 MB is the default and the plan figure must be confirmed in the Console. Pages: https://cloudinary.com/documentation/upload_images (Troubleshooting large file upload failures; Manual chunked upload), https://cloudinary.com/documentation/image_upload_api_reference#upload_large.
    - *Chunk protocol.* Every chunk is a POST to the same upload endpoint with the usual upload params, the same `X-Unique-Upload-Id`, and `Content-Range: bytes <start>-<end>/<total>` (inclusive); every chunk but the last must be larger than 5 MB; the SDK default is 20 MB with a 5 MB minimum; the answer is `done: false` until the last chunk. The documented curl repeats `api_key`, `timestamp` and `signature` on each chunk. Pages: upload_images (Manual chunked upload), https://cloudinary.com/documentation/node_image_and_video_upload (`upload_large`). A signature stays valid for one hour (https://cloudinary.com/documentation/generate_upload_signature_tutorial).
    - *Signing eager.* `eager` is a normal signed param: its raw, unencoded value is part of the sorted `name=value&...` string, then the secret is appended (https://cloudinary.com/documentation/authentication_signatures; the documented vector with `eager=w_400,h_300,c_pad|w_260,h_200,c_crop` is already a test). `resource_type`, `file`, `api_key` and `cloud_name` are not signed.
    - *On-the-fly vs eager.* On-the-fly video transformations are limited to 40 MB on Free and 300 MB on paid plans ("Video is too large to process synchronously..."); the fix is `eager` with `eager_async=true` (https://cloudinary.com/documentation/ts_troubleshooting_video_transformation_errors). On-the-fly duration limits are 60 min for ABR and 30 min for progressive output; longer ones are processed asynchronously and return 423 until done (https://cloudinary.com/documentation/video_manipulation_and_delivery). A derivative still in the making answers 423 "is pending"; retry later (https://cloudinary.com/documentation/ts_what_are_the_common_error_codes_returned_in_the_x_cld_error_header_when_delivering_assets). `eager_async` returns the upload at once and warms the cache in the background; the docs say to always add `eager_notification_url` (https://cloudinary.com/documentation/upload_parameters_processing). We do not: nothing here listens for a webhook, and the route reports "processing" until the derivative exists.
    - *Byte ranges.* The docs retrieved do not state that delivered derived audio supports HTTP byte ranges or `Accept-Ranges`. Unproven, so the app does not rely on it (see the route below).
    - *Streaming profiles and HLS.* Documented for video only (`sp_auto`, `.m3u8`, https://cloudinary.com/documentation/adaptive_bitrate_streaming); no audio-only profile is documented. Not used.
    - *Admin API duration.* `GET /resources/video/<type>/<public_id>?media_metadata=true` returns `duration`, `bit_rate`, frame rate and codecs (https://cloudinary.com/documentation/ts_how_can_i_get_the_size_or_dimensions_of_an_image_by_its_public_id, admin_api "Get the details of a single resource"). The real shape, observed on a Chrome MediaRecorder recording (hotfix `eec19d4`), differs from the upload answer: `format` is `mka` for an audio-only webm, `is_audio`/`audio`/`video` are nested under `video_metadata`, and the duration is at the top level or in `video_metadata.duration`. The hotfix is kept as it is; `createMemory` reads duration and size from this answer and nothing from the browser.
  - **Limits.** 60 minutes (`MAX_AUDIO_MS` 3,600,000; the server forgives 5 s of recorder drift, 3,605,000 in all). Bytes: `MAX_AUDIO_BYTES` 100,000,000 (decimal, the safe reading of "100 MB"), overridable on the server with `MEMORY_MAX_AUDIO_BYTES` (`readMaxAudioBytes`: plain positive integer of at least 1 MB, capped at 2,000,000,000, anything else is ignored). The browser mirrors the default only (the variable is not exposed), so raising it above the default also needs the client constant raised. Copy: "Hasta 60 minutos. Para audios largos usa MP3, M4A u OGG; un WAV de una hora es demasiado pesado." The upload ticket now lives 1 hour (it was 15 min) so a slow long upload can still be saved; Cloudinary honours the signature for one hour too.
  - **Chunking.** Files above 20 MB go in 6 MB chunks (`ui/chunk-plan.ts`, `ui/chunked-upload.ts`, wired in `ui/cloudinary-upload.ts`): same signed fields and one `X-Unique-Upload-Id` on every chunk, per-chunk retry (4 attempts; 1 s, 2 s, 4 s waits; only network errors, 408, 429 and 5xx), progress aggregated over the whole file and never going back, cancel on close aborts the chunk in flight. Small files keep the single request. The Blob is sliced and posted as it is.
  - **Eager.** The audio grant adds `eager=f_mp3` and `eager_async=true` to the signed params, so the mp3 is made once at upload. mp3 stays the target (it plays on Safari and iOS and seeks by byte offset); m4a was not chosen.
  - **Delivery and seeking.** Range support on derived audio is unproven, so `src/app/api/memories/[id]/audio/route.ts` (dynamic, `force-dynamic`; no `fs`, so there is nothing to trace) calls `serveAudioWith`: session required (401), uuid check (404), the memory read through the new `findForVisitor` under RLS (404 for a missing, rejected, audio-less or not-visible memory), the signed mp3 fetched server-side with the browser's `Range` clamped to 8 MiB windows, and streamed back as 206 with `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`, `Content-Type: audio/mpeg` and `Cache-Control: private, max-age=3600`. If Cloudinary ignores `Range` and answers 200, the range is cut in the route (206, or 416). Cloudinary's headers and the signed URL never reach the browser. A 423, or a 400 whose `X-Cld-Error` says it is pending or too large to process, becomes 503 with `Retry-After: 10`, `X-Audio-State: processing` and `no-store`; other failures are 502. The DTO's `audio.url` is now `/api/memories/<id>/audio`.
  - **Not-ready state.** `ui/audio-readiness.ts` (`probeAudio`, `useAudioReadiness`, copy "Procesando audio…" and "Audio no disponible") probes the route with `Range: bytes=0-0` and retries with a bounded backoff (about 5 minutes). It is not wired into `glass-view.tsx`, which the other writer owns: T3 has to call `useAudioReadiness(memory.audio?.url ?? null)` there and show the copy in place of the play button until `ready`.
  - **Recorder.** Cap 60 min, `MediaRecorder.start(2000)`, the same MIME picking, ticks twice a second (was ten times), elapsed time with an approximate size (`10:00 / 60:00 · ~35 MB`), a quiet `role="status"` warning from 55 minutes (`recordingNotice`), and an automatic stop at the size cap too. No base64 anywhere: the clip is one Blob joined from the chunks and uploaded as it is.
  - **Migration.** `20261004000000_memory_long_audio`: one `ALTER TABLE` that drops and re-adds `memories_audio_duration_range` (1 to 3,605,000) and `memories_audio_bytes_range` (1 to 2,000,000,000). Nothing else changes. Covered by the migration lint tests (snake_case, RLS untouched, no grants, no other table, old bounds contained).
  - **TDD.** Strict. RED was observed first for the limits and copy (7 files, 13 tests failing), the eager params (3 failing), the chunk planner, uploader and XHR branch (2 files unable to import, 3 failing), the route (import failures), the readiness hook (import failure) and the recorder (14 failing). One hook bug (a new `fetch` seam on every render restarted the check) was found by the tests and fixed.

## Next step

T3: integrate T1 and T2 (wire `useAudioReadiness` into the glass view), run the critical review, then T4 (migration, env note, live check).
