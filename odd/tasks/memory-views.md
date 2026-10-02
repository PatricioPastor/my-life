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

- [x] **T1 — Schema and server.** (`788389e`)
  - Migration: table, RLS, grants, trigger and `view_count`.
  - Repository `recordView(handle, memoryId)` as an upsert under `withVisitor`.
  - A `recordMemoryView({ id })` server action: requires a session; no-op for guests, the author and non-approved memories.
  - `viewCount` in the DTO.
  - Lints extended if needed (a `SECURITY DEFINER` function must pin `search_path`).
- [x] **T2 — UI.** (`193bb77`)
  - The glass view records a view once per open: the first time it opens on a memory in a session, and again on a later open, which the server dedupes.
  - Shows "N vistas".
  - Never fired for guests or on prev/next prefetch, only on an actual open or switch-arrival.
- [ ] **T3 — Deliver.**
  - RDD.
  - Apply the migration after authorization.
  - Push.
  - Live check: two handles open the same memory several times, so the count is 2, open counts accumulate, the author is not counted, guests are not counted, and RLS hides other handles' rows from `app_user`.
  - **Migration to apply:** `prisma/migrations/20261005000000_memory_views/migration.sql`, with the owner role (`DIRECT_URL`), after the user authorizes it. Not applied yet. Expand-only: the previous code ignores both the new column and the new table.
  - **Exact live-check steps** (needs two real handles A and B, an approved memory M written by a third handle C, and the owner connection for the SQL):
    1. Before: `SELECT view_count FROM memories WHERE id = '<M>'` is 0 (or note N), and `memory_views` has no row for M.
    2. As A, open M in the glass (not a prefetch: click its orb, or step to it and let the camera land). Expect the glass to read "1 vista" (N + 1). Owner SQL: one row `(M, A)` with `open_count = 1`, and `view_count = N + 1`.
    3. As A, close it and open M again, and once more (reload the page between opens too). Expect the label unchanged. Owner SQL: still one row for `(M, A)`, `open_count` 2 then 3, `last_viewed_at` moved, `first_viewed_at` unchanged, and `view_count` still N + 1. This is the check of the Postgres behavior in the Progress entry below (an `ON CONFLICT DO UPDATE` takes the UPDATE path and fires no row-level INSERT trigger).
    4. As B, open M twice. Expect "2 vistas" (N + 2) for B. Owner SQL: two rows for M, `view_count` = N + 2, B's `open_count` = 2.
    5. As C (the author), open M. Expect no change: no row `(M, C)`, `view_count` unchanged. Then, as any visitor, open a still-pending memory: no row either.
    6. As a guest, open `/m/<token>` for M several times. Expect the count to be shown ("N + 2 vistas") and no new row and no change in `view_count`. The network tab shows no `recordMemoryView` call (a server action POST) from the guest page.
    7. RLS as `app_user` (`withVisitor` shape, in one transaction): with `app.handle = 'A'`, `SELECT handle FROM memory_views` returns only A's row; with `app.handle = 'C'`, `INSERT INTO memory_views (memory_id, handle) VALUES ('<M>', 'C')` fails with a row-level security error (the author); inserting a row for another handle (`'A'` while `app.handle = 'B'`) fails; with no handle set the select returns nothing; `DELETE FROM memory_views` and `UPDATE memories SET view_count = 0` are both refused (no grant).
    8. Check the trigger is owner-owned with a pinned path: `SELECT proname, prosecdef, proconfig, pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'memory_views_count_view'` gives `prosecdef = true`, `proconfig = {search_path=public, pg_temp}`, the migration role as owner. And `has_function_privilege('app_user', 'memory_views_count_view()', 'EXECUTE')` is false.
    9. Clean up the test rows (owner): `DELETE FROM memory_views WHERE ...` and put `view_count` back with `UPDATE memories SET view_count = (SELECT count(*) FROM memory_views WHERE memory_id = id)`.

## Progress

- 2026-10-02: Document created from the user's request.
- 2026-10-02: T1 and T2 built by one delegated writer (route: delegated direct; trigger: 2+ non-trivial files across schema, server and UI), strict TDD. Not applied to any database.
  - **Schema** (`prisma/migrations/20261005000000_memory_views`, generated with `prisma migrate diff` offline, then hand-edited):
    - `memory_views`: `id` uuid, `memory_id` uuid FK to `memories(id)` `ON DELETE CASCADE`, `handle varchar(30)`, `first_viewed_at`, `last_viewed_at` (timestamptz(3), default `now()`), `open_count int` default 1 with `CHECK (open_count > 0)`, `UNIQUE (memory_id, handle)`, index on `memory_id`. RLS enabled and forced.
    - Grants, for `app_user` only and column-level: `INSERT (memory_id, handle)`, `UPDATE (last_viewed_at, open_count)`, `SELECT (memory_id, handle, open_count, first_viewed_at, last_viewed_at)`. No DELETE, nothing to PUBLIC.
    - Policies, all `TO app_user`: SELECT and UPDATE (USING and WITH CHECK) on `handle = NULLIF(current_setting('app.handle', true), '')`; INSERT WITH CHECK the same plus an `EXISTS` on an approved memory whose `handle` is not the visitor's.
    - `memories.view_count integer NOT NULL DEFAULT 0` with `CHECK (view_count >= 0)`; no new grant on `memories`.
    - Prisma model `MemoryViewRecord` (not `MemoryView`, which is the DTO), `viewCount` on `Memory`, both defaults `dbgenerated` so the engine never sends them.
  - **Trigger and why:** `app_user` has no UPDATE on `memories`, so `memory_views_count_view()` increments `memories.view_count` for `NEW.memory_id`, `SECURITY DEFINER`, owned by the migration role, `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC`, attached `AFTER INSERT ON memory_views FOR EACH ROW`. It relies on the owner role bypassing RLS (Neon's owner does, as the init migration says); if the owner ever lost `BYPASSRLS` the update would match no row, silently, because `memories` has FORCEd policies and no UPDATE policy. The live check step 2 catches that.
  - **Postgres docs check (Context7, PostgreSQL current docs):** an `INSERT ... ON CONFLICT DO UPDATE` is one command that "may cause both insert and update operations, so it will fire both kinds of triggers as needed", and "an INSERT trigger will see only the inserted rows, while an UPDATE trigger will see only the updated rows" ([CREATE TRIGGER, Notes](https://www.postgresql.org/docs/current/sql-createtrigger.html)). A `FOR EACH ROW` trigger "is called once for every row that the operation modifies" (same page, Description), and the trigger overview describes the conflict case as row-level `BEFORE INSERT` followed by `BEFORE UPDATE` for a conflicting row ([37.1 Overview of Trigger Behavior](https://www.postgresql.org/docs/current/trigger-definition.html)). So a conflicting row takes the UPDATE path and fires only UPDATE triggers; the AFTER INSERT row trigger fires only for a row actually inserted. Caveat: statement-level triggers do fire either way (same 37.1 page), which is why this one is `FOR EACH ROW`. The docs do not put the "no row-level INSERT trigger on the update path" sentence in one place, so live-check step 3 verifies it.
  - **Other docs facts used** ([INSERT](https://www.postgresql.org/docs/current/sql-insert.html), [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)): `ON CONFLICT DO UPDATE` needs `UPDATE` only on the updated columns but `SELECT` on every column it reads (the conflict target and `open_count + 1`), and `RETURNING` needs `SELECT` on what it returns; with RLS the proposed row is checked against the SELECT policy and a refusal is an error, never a silent skip. That is why the visitor gets a column-level `SELECT` on the table, and why an RLS refusal arrives as an error (SQLSTATE 42501) that the repository turns into a quiet no-op.
  - **Server:**
    - Port `ViewRecorder.recordView(handle, memoryId)`, implemented by `PrismaMemoryRepository` beside the existing ports, in `withVisitor(handle)`: `INSERT INTO memory_views (memory_id, handle) VALUES ($1::uuid, $2) ON CONFLICT (memory_id, handle) DO UPDATE SET last_viewed_at = now(), open_count = memory_views.open_count + 1 RETURNING open_count`. `counted` is `open_count = 1` (a new pair). It does not use `xmax = 0`: reading a system column needs table-level SELECT, which `app_user` lacks on this table.
    - An RLS refusal (author, non-approved) returns `{ counted: false }`; any other error is rethrown to the action.
    - `recordMemoryView({ id })` (`views/record-view.ts`): `no_session` without a session; `not_countable` for a bad uuid, a memory the visitor cannot see, a non-approved one or the visitor's own; `{ ok: true, counted }` otherwise; `unavailable` (logged by error name only) on failure. Never throws. The handle always comes from the session.
    - DTO `viewCount` (list and shared views). Handles never leave the server.
  - **Lints extended:** the migration lint now allows `UPDATE` only per column (never table-wide, never on `id`, `handle`, `memory_id`, `status`, `created_at`, never on `memories`), still refuses DELETE and ALL, and requires every `SECURITY DEFINER` function to `SET search_path` and to have `EXECUTE` revoked from PUBLIC. The schema lint requires an explicit `onDelete` on the owning side of every relation.
  - **UI:** `GlassView` takes `onView` (the server action, passed by `MemoriesSpace` through `MemoriesPlace`; the guest page never passes it, and the glass also ignores it when `guestExit` is set). One call per approved memory per page session (`createViewRecorder` dedupes, including while a call is in flight), made when the glass has landed on it (`switching` false): not for the neighbours it warms, not for a pending memory, not for memories passed through on rapid steps. The count shows after the date as plain text ("1 vista" / "N vistas", `Intl.NumberFormat("es")` so 12345 reads "12.345", hidden at 0, `aria-live="off"` so the catch-up is not announced) and goes up by one only when the server answers `counted: true`. The author's own approved memories are asked about once too (the client does not know the author) and the server refuses them.
  - **TDD, RED then GREEN:** the first run of the new T1 tests failed 28 tests plus the unloadable `record-view.test.ts` (migration and schema lints, repository `recordView` and `viewCount`, the DTO, the guest DTO); the T2 run failed 18 glass-view tests plus the missing `view-count` and `view-recorder` modules, then 2 more for place and space wiring. All GREEN afterwards.
  - **Checks:** `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 171 files and 2767 tests pass, `pnpm build` passes with `/` still `○`.
  - **Commits:** `788389e` (schema, server, lints), `193bb77` (glass).

## Next step

T3: RDD, then, with the user's authorization, apply `20261005000000_memory_views` and run the live check above.
