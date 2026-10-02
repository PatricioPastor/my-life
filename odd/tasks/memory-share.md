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

## Next step

T4: deliver (full checks, RDD, the live check after authorization, then fast-forward main).
