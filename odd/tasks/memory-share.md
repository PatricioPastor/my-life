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

- [ ] **T1 — Share token, server action and guest data access** (token sign/verify, `shareMemory` action, guest DTO lookup for approved memories, token-gated audio).
- [ ] **T2 — Guest page `/m/[token]`** (guest glass view, exits to `/`, redirects, metadata and OG image, analytics).
- [ ] **T3 — Share button in the glass view** (Web Share and clipboard fallback).
- [ ] **T4 — Deliver.** Full checks and RDD. A live check after authorization: share a real approved memory, open it with no cookies, play its audio, check the OG preview, check that an invalid token redirects. Then fast-forward main.

## Progress

- 2026-10-02: Document created. Any admitted visitor can share approved memories (the user chose this).

## Next step

T1 to T3 (one writer).
