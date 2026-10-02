# Memory views

- **Locator:** `odd/tasks/memory-views.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-views/tasks` (project `theduck`; pending while the Engram server is disconnected)
- **Branch:** `feat/memory-views` from `main` @ `dbdd330`

## Objective

Count views on memories: one per distinct Instagram account that opened it. Store which account viewed it, so the owner can query it later.

## User request (2026-10-02, verbatim)

"Agregale vistas a los recuerdos por cada apertura, guardá el IG vinculado, pero que esa vista, si hay más de un Instagram acumulado, que no lo referencie a pesar, que sea un distinct las views."

## Decisions

- **What counts:** each time a visitor with a session opens a memory (the glass view opens on it), that visitor's handle is recorded for that memory.
  - The count is the number of DISTINCT handles, not the number of opens.
  - Repeat opens only update `last_viewed_at` and `open_count` on the same row.
- **Not counted** (chosen by me; the user can change it):
  - guests opening a shared link: they have no Instagram account to make the count distinct;
  - the memory's own author.
- **Only approved memories** are counted.
- **Shown:** only the number, e.g. "12 vistas" (singular "1 vista"; hidden at 0), quietly in the glass view. The handles are never sent to the client; they stay in the database for the owner.
- **Schema** (expand-only, snake_case, RLS):
  - **Table `memory_views`:**
    - `id`, `memory_id` (FK, `ON DELETE CASCADE`), `handle`, `first_viewed_at`, `last_viewed_at`, `open_count`;
    - `UNIQUE (memory_id, handle)`;
    - RLS enabled and forced.
  - **`app_user` grants:**
    - `INSERT (memory_id, handle)`;
    - `UPDATE (last_viewed_at, open_count)`;
    - `SELECT` on its own rows only.
  - **Policies:**
    - INSERT, UPDATE and SELECT only where `handle = NULLIF(current_setting('app.handle', true), '')`;
    - INSERT also requires the memory to be approved and not authored by the viewer, as a second line of defense.
  - **Counter:** `memories.view_count integer NOT NULL DEFAULT 0`. A `SECURITY DEFINER` trigger (owner-owned, with a fixed `search_path`) increments it after each INSERT into `memory_views`. A repeat open is an upsert that updates the existing row and doesn't fire the INSERT trigger. `app_user` never gets UPDATE on `memories`.
  - **The read path** returns `view_count` in the DTO as `viewCount`.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`. Remote operations need the user's authorization: applying the migration and any live check.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev server on port 3001; stop only your own PID.
- `/` stays static. Keep review slices under about 1,800 changed lines.

## TDD

Strict. Runner `pnpm test`.

## Tasks

- [ ] **T1 — Schema and server.**
  - Migration: table, RLS, grants, trigger and `view_count`.
  - Repository `recordView(handle, memoryId)` as an upsert under `withVisitor`.
  - A `recordMemoryView({ id })` server action: requires a session; no-op for guests, the author and non-approved memories.
  - `viewCount` in the DTO.
  - Lints extended if needed (a `SECURITY DEFINER` function must pin `search_path`).
- [ ] **T2 — UI.**
  - The glass view records a view once per open: the first time it opens on a memory in a session, and again on a later open, which the server dedupes.
  - Shows "N vistas".
  - Never fired for guests or on prev/next prefetch, only on an actual open or switch-arrival.
- [ ] **T3 — Deliver.**
  - RDD.
  - Apply the migration after authorization.
  - Push.
  - Live check: two handles open the same memory several times, so the count is 2, open counts accumulate, the author is not counted, guests are not counted, and RLS hides other handles' rows from `app_user`.

## Progress

- 2026-10-02: Document created from the user's request.

## Next step

T1 and T2 (one writer).
