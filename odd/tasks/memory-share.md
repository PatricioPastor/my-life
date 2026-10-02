# Share a memory

- **Locator:** `odd/tasks/memory-share.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-share/tasks` (project `theduck`; pending while the Engram server is disconnected)
- **Branch:** `feat/memory-share` from `main` @ `1156faf`

## Objective

Let admitted visitors share an approved memory through a link. Whoever opens it sees that single memory as a guest, without a session. Anything else sends them to the start.

## User request (2026-10-02, verbatim)

"Agregá un modo para compartir el recuerdo! Pero sin sesión, es como invitado, sino te manda al inicio."

## Decisions

- **Who shares:** any visitor with a session can share any APPROVED memory (the user chose this). Pending and rejected memories are never shareable.
- **The link:**
  - **Token:** stateless and signed. It is the memory id plus an HMAC with `SESSION_SECRET`, domain-separated (e.g. `"share:v1"`, the way the upload ticket is separated from the session) and truncated to keep the URL short.
  - **No database writes:** `app_user` has no UPDATE grant, and RLS stays untouched.
  - **Revocation:** reject the memory, which makes it non-approved so the link stops working. Rotating `SESSION_SECRET` invalidates every link (document it).
  - **No expiry.**
- **Route:** a dynamic page `/m/[token]`. `/` stays static. An invalid token, a non-approved memory or a missing memory redirects to `/` (the start).
- **Guest view:**
  - **What it shows:** the memories dimension (void, dust) with ONLY that memory, open in the glass view: photo or voice, caption, date, place name (coarse, as in the viewer) and audio playback.
  - **Exits:**
    - there is no access to other memories, the add-memory button, the constellation or the sky;
    - "Universo" and Esc go to `/`, which then runs the onboarding and gate;
    - a quiet "Entrar al universo" call to action does the same.
- **Audio for guests:** the long-audio route requires a session today. Add token-based access for the shared memory only, with the same range-aware streaming and the same 503 "processing" behavior. Never expose signed Cloudinary URLs.
- **Link previews:** Open Graph and Twitter metadata on `/m/[token]`.
  - Title: the caption. Description: the date, plus "Un recuerdo de patriciopastor" or similar neutral copy.
  - Image: a signed 1200x630 crop of the photo. Audio-only memories use a generated OG image in the orb color.
  - `noindex` (robots), so shared memories don't get indexed.
- **Share button:** in the glass view, for approved memories only.
  - Phones: `navigator.share` with the title, text and URL.
  - Desktop, or without Web Share: copy to the clipboard, with a quiet "Enlace copiado" confirmation.
  - The share URL is built server-side through a server action that requires the session, verifies the memory is visible and approved, and returns the URL. The client never builds tokens.
- **Analytics:** `memory_shared` and `shared_memory_opened`, no props, allow-listed.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`. Remote operations need the user's authorization.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev server on port 3001; stop only your own PID.
- `/` stays static. Any `fs` reads in the new route must be trace-included.
- Keep review slices under about 1,800 changed lines.

## TDD

Strict. Runner `pnpm test`.

## Tasks

- [x] **T1 — Share token, server action and guest data access** (token sign/verify, `shareMemory` action, guest DTO lookup for approved memories, token-gated audio).
- [x] **T2 — Guest page `/m/[token]`** (guest glass view, exits to `/`, redirects, metadata and OG image, analytics).
- [x] **T3 — Share button in the glass view** (Web Share and clipboard fallback).
- [ ] **T4 — Deliver.** Full checks and RDD. A live check after authorization: share a real approved memory, open it with no cookies, play its audio, check the OG preview, check that an invalid token redirects. Then fast-forward main.

## Progress

- 2026-10-02: Document created. Any admitted visitor can share approved memories (the user chose this).

- 2026-10-02 (T1 to T3, delegated writer, commits `322985c`, `0938299`, `84ab64a`):
  - **Token:** `<memory uuid as 16 bytes, base64url (22 chars)>.<HMAC-SHA256(SESSION_SECRET, "share:v1:" + id) truncated to 16 bytes, base64url (22 chars)>`. Constant-time compare; the id part must decode to exactly 16 bytes. A session cookie or an upload ticket never verifies as a share token, and the other way round (tested against `signSession` and `signUploadTicket` with the same secret). Rotating `SESSION_SECRET` invalidates every link; rejecting the memory revokes one.
  - **Sharing:** `shareMemory({ id })` (server action) needs a session, reads the memory as the visitor and refuses anything that is not approved (`not_shareable`), then answers the absolute `/m/<token>` URL from `resolveSiteUrl`.
  - **Guest data path:** `findSharedMemory(token)` verifies the token, then reads through the `app_user` connection with an empty `app.handle` (so the select policy only lets approved rows through) via a new port, `ApprovedMemoryReader.findApproved`, which also filters `status = 'approved'` itself. No migration, RLS untouched. It returns the same `MemoryView` the glass uses (photo sizes, coarse place, orb color, no handle) plus the signed 1200x630 preview URL for photos.
  - **Audio access (choice):** a separate route, `/api/memories/shared/[token]/audio`, rather than a `?share=` param on the session route. The session route keeps a single way in (the session), the token never ends up in a query string that logs and caches treat differently, and the token names exactly one memory, so it cannot reach another memory's audio. The streaming (`Range`/206, 416, 503 "processing") is the shared `streamAudio` inside `serve-audio.ts`, no duplication.
  - **Page and metadata:** `/m/[token]` is dynamic (`ƒ`); any failed lookup redirects to `/`. The client mounts the place after hydration (a stale server viewport aimed the camera wrongly on phones), opens the one memory by itself, and has no prev/next, swipe, wheel-exit, add button, constellation or sky. "Universo", Esc, Cerrar and a quiet "Entrar al universo" link all go to `/`. `generateMetadata`: caption as title, date plus "Un recuerdo de patriciopastor" as description, `robots` noindex and nofollow, Twitter `summary_large_image`. OG image: a signed 1200x630 `f_jpg` Cloudinary crop for photos; for audio-only memories an `ImageResponse` card (orb in `orbColor` on the void, plus the caption) from the route handler `/m/[token]/og`, in the font ImageResponse bundles (nothing fetched). No `fs` reads, so no trace includes.
  - **Share button:** `Compartir` in the glass (approved only, never pending). It asks `shareMemory`, then uses `navigator.share` only on a coarse pointer with Web Share, and otherwise (or when the sheet fails) copies the link and says "Enlace copiado" (`role="status"`, about 2 s). An `AbortError` is silent. A guest has no session to call the action, so their button passes on the link they hold (the page URL). Analytics: `memory_shared` on success and `shared_memory_opened` once per guest visit, both allow-listed with no props.
  - **Checks:** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 168 files / 2680 tests passing, `pnpm build` with `/` static and `/m/[token]`, `/m/[token]/og` and both audio routes dynamic. Visual check with Playwright on :3001 at 1440x900 and 390x844 through a temporary harness (deleted): the guest view with a photo and audio-only, "Enlace copiado" and its fade, `/m/not-a-token` redirecting to `/`, Esc leaving to `/`. Shots `s-*` in the session scratchpad. Nothing ran against the real database or Cloudinary.
- 2026-10-02 (follow-up fix, same branch): two review items. (1) The share link is prefetched once per memory (a cache the glass keeps for the session; failures are forgotten so a click can retry) when an approved memory opens, so the click calls `navigator.share` with no await before it and keeps the user gesture on iOS Safari. If the link is not there yet at click time it is awaited and copied instead. Pending memories never prefetch; guests already hold the link. (2) Cerrar is first in the DOM again (the row is visually reversed), so it keeps the dialog's initial focus, with Compartir next in Tab order. Checks: lint, typecheck, test (168 files, 2688 tests) and build all pass.

- 2026-10-02 (T4), Live check: with the user's authorization ("Sí, ambas"), a temporary vitest harness (`src/__smoke__/`, deleted; `jpeg-js` in the session scratchpad; `smoke_test` put on the whitelist in-process only, `.env.local` untouched) ran the real `prepareUpload`, `createMemory` and `shareMemory` against Cloudinary and Neon as `app_user` for three memories: an approved photo (JPEG 2000x1300), an approved audio-only memory (10 s WAV) and a pending photo. They were approved as the owner. Then `pnpm build` and `pnpm start -p 3001` (with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` in the process env, so the absolute links and the OG URL point at the local server) and Playwright Chromium with no cookies. No Nominatim request was made (no location shared).

  | # | Check | Result | Evidence |
  |---|-------|--------|----------|
  | 1 | `shareMemory` | PASS | Approved photo and audio memories answer `ok` with absolute `<origin>/m/<22 chars>.<22 chars>` URLs (the origin was the `http://localhost:3000` fallback with no `NEXT_PUBLIC_SITE_URL`); the pending memory answers `not_shareable`, a malformed id `not_shareable`, and a call with no session `no_session`. |
  | 2 | Guest page, photo | PASS | `/m/<token>` answers 200 with no cookies and stays on the URL. Visible: caption "Smoke photo: tarde en el río", "20 de septiembre de 2026", the Cloudinary photo (768 px square crop). Controls: Cerrar, Compartir, Universo and the "Entrar al universo" link only (no add button, no prev/next, no constellation or sky controls). Clicking Universo and, on a fresh load, Esc both ended on `/`. |
  | 3 | Guest page, audio-only | PASS (503 not observed) | The voice glass loads ("0:10", "Reproducir audio"). The mp3 was ready on the first poll (1.4 s), so the 503 processing state was not exercised live (covered by tests). The browser's own requests were `bytes=0-0` then `bytes=0-`, both 206 (`bytes 0-0/28232`, `bytes 0-28231/28232`); a direct `bytes=1000-1999` gave 206 with `Content-Range: bytes 1000-1999/28232`, `bytes=99999999-` gave 416, no `Range` gave 200 with `Content-Length` 28232, all with `Accept-Ranges: bytes`, `audio/mpeg`. In Chromium `currentTime` went 2.71 to 5.22 over 2.5 s (not paused, no error, duration 10) and the analyser level reached 47 (of 128) over 143 reads. |
  | 4 | Refusals | PASS | The pending token, a tampered signature (first character changed), a session cookie value used as a token and `not-a-token` all answer 307 to `/` (the browser ends on `/`). `/api/memories/shared/<tampered>/audio`, with the pending token and with a session value: 404. The photo memory's token on the audio route: 404 (a token reaches only its own memory). The session audio route with no cookie: 401. |
  | 5 | Metadata | PASS | Photo: `og:title` is the caption, `og:description` "20 de septiembre de 2026 · Un recuerdo de patriciopastor", `og:image` a signed `f_jpg,q_auto,c_fill,g_auto,w_1200,h_630` Cloudinary URL (200, `image/jpeg`, 35,381 bytes, 1200x630), `og:image:width/height` 1200 and 630, `twitter:card` `summary_large_image`, `robots` `noindex, nofollow`. Audio: `og:image` is `<origin>/m/<token>/og`, which answers 200 `image/png` 1200x630 (180,113 bytes), the same metadata otherwise. |
  | 6 | Share button | PARTIAL / SKIP | The session path is skipped: the running server's whitelist does not hold `smoke_test` and `.env.local` was not touched. As a guest (clipboard permission granted) a click on Compartir copied exactly the page URL and showed "Enlace copiado" (PASS). |
  | 7 | Cleanup | PASS | The three Cloudinary resources were deleted through the Admin API (originals and derived mp3) and a fresh Admin read answers 404 for each; no resource of ours is left under `my-life/memories` (the 7 that remain are other memories); 0 `smoke_test` rows as the owner; the harness, scratch files and screenshots were deleted; `git status` is clean; nothing listens on :3001 (only my own PID was stopped). |

  - **Observation:** the first ranged request to a cold audio derivative answered 200 with the whole mp3 and no `Content-Length` (Cloudinary sends the full file while the derivative is being made; the same behavior as the long-audio live check). The browser's requests (the next ones) got proper 206s. Harmless for short audio.
  - **Not exercised:** the Share button with a session (needs `smoke_test` on the server's whitelist), the native share sheet on a phone, a real Safari or iPhone, the 503 processing state live, and rejecting a memory to see a live link stop (covered by the pending-memory refusal and the unit tests).

## Next step

T4: the live check passed (the session-based Share button click was skipped, the guest one passed). Remaining: the final full checks and RDD for the branch, then fast-forward main.
