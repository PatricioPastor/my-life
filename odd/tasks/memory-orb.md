# Memory orb and memories space

- **Locator:** `odd/tasks/memory-orb.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-orb/tasks` (project `theduck`)
- **Branch:** `feat/memory-orb` from `main` @ `fee0d77`

## Objective

A color-shifting orb floats across the whole galaxy. Clicking it ("Agregar recuerdo") takes the visitor, through a portal journey like the entrance one, to a memories space where points float, one per approved memory. Visitors can add a memory: a photo, a short text and a date. Each memory stays pending until the owner approves it.

## User request (summary)

- An orb that floats around the whole galaxy and keeps changing colors: related to the project, with contrast, but tasteful; "medio RGB" is fine.
- Clicking it means "Agregar recuerdo". It takes you somewhere else through a portal journey, where points float; each point is an uploaded image.
- Images are stored in Cloudinary.

## Decisions

- **Who uploads:** admitted visitors. Nothing shows until the owner approves it.
- **Approval:** a manual SQL `UPDATE` in the database for now. No admin UI, and no Cloudinary moderation.
- **Database:** Neon Postgres with Prisma 7. The user created an empty database and has both the pooled and the direct connection strings.
  - Runtime uses the pooled `DATABASE_URL`; the Prisma CLI uses the direct `DIRECT_URL`.
  - This is the base for later features.
- **A memory:** a photo, a short text (up to about 140 characters) and the date it happened.
- **Delivery:** everything on `feat/memory-orb`. Main is fast-forwarded in a single step at the end, after the user approves.
- **Database rules (user, mandatory):**
  - **snake_case:** every table, column and enum is snake_case through Prisma `@@map` and `@map`.
  - **RLS on every table:** `ENABLE` and `FORCE ROW LEVEL SECURITY`, with explicit policies per operation.
    - RLS works per table, not per column; column-level limits use column `GRANT`s.
    - Neon's owner role (`neondb_owner`, a member of `neon_superuser`) has `BYPASSRLS`, verified in the Neon docs. The runtime therefore connects with a restricted login role, `app_user`. It must be created with SQL, not from the Neon console, because console roles inherit `BYPASSRLS`.
    - The owner role is for migrations only. A guard refuses to run when the runtime `DATABASE_URL` uses the owner role.
- **Orb colors:** cool RGB hues (cyan, violet, magenta) that contrast with the warm ember galaxy without fighting it.
- **Identity:** when the gate admits a handle, it sets a signed `httpOnly` session cookie, so the server knows who uploads.
  - Known limit: the gate compares a typed Instagram handle against the whitelist, which is not real authentication. Anyone who knows an admitted handle can upload, and the approval step is what mitigates it.
- **Secrets:** they live only in `.env.local` and in Vercel, never in the repo.
  - Agents must not read `.env.local`; a deny rule blocks it.
  - Variables: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

## Constraints

- Public repository: never commit `.env.local`, credentials or connection strings.
- Conventional Commits with no AI attribution.
- Code and docs in English. UI copy in neutral Spanish (`tú`).
- Screaming architecture: `src/features/memories` holds the domain, ports and use cases. Adapters such as Prisma and Cloudinary live behind ports and are `server-only`.
- `/` stays static. The database is only reached through server actions or route handlers.
- Remote operations need explicit user authorization first: migrations against Neon, role creation, and anything touching Cloudinary or Vercel.
- Dev servers use port 3001, and a writer stops only the PID it started, never processes by name.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test` (Vitest).
- **Test-first:** domain rules, the session cookie, the use cases with fake ports, the orb motion and colors as pure functions, and upload validation.

## Tasks

- [x] **T1 — Data foundation.**
  - Prisma 7 with the Neon adapter.
  - `Memory` model, snake_case mapped.
  - Migration SQL with RLS enabled and forced, policies and grants for `app_user`.
  - `MemoryRepository` port with a Prisma adapter.
  - A transaction helper that sets the visitor handle for the policies.
  - The owner-role guard.
  - Code only: no remote operations.
- [x] **T2 — Visitor session.**
  - The gate sets a signed `httpOnly` cookie on success.
  - A `currentVisitor()` server helper.
  - Expiry and tamper checks.
- [ ] **T3 — Orb.**
  - Wandering, color-shifting orb in the sky; a magnetic-cursor target with the "Agregar recuerdo" label.
  - Click starts the portal journey to the memories space.
  - Reduced motion is respected.
- [ ] **T4 — Memories space.**
  - Floating points for approved memories, with Cloudinary thumbnails.
  - Opening a point shows the photo, the text and the date.
  - Empty state.
- [ ] **T5 — Upload.**
  - Form: photo, text and date.
  - A server-signed Cloudinary upload; the server verifies the asset, then inserts a `pending` row under RLS as the visitor.
  - Size, type and per-handle rate limits.
  - A "pending approval" confirmation.
- [ ] **T6 — Remote setup (needs authorization).**
  - Create `app_user` with SQL and run the migrations on Neon.
  - The user swaps `DATABASE_URL` to `app_user` and adds the variables to Vercel.
- [ ] **T7 — Deliver.**
  - Full checks and RDD per slice.
  - Fast-forward main and push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, and `/` stays static.
- Every table has RLS enabled and forced, with policies. `app_user` can read only approved memories and can insert only pending ones under its own handle. Nothing in the runtime path connects as the owner.
- Every table, column and enum is snake_case in the database.
- Approving a memory with a manual `UPDATE ... SET status = 'approved'` makes it appear in the space.
- No secret or font file is tracked by git.

## Delivery forecast

About 1,600 authored changed lines (T1 ~300, T2 ~200, T3 ~350, T4 ~400, T5 ~400). Single feature branch, delivered at the end, as the user chose. RDD is assessed per work-unit commit.

## Progress

- 2026-10-01: Document created. Decisions above confirmed with the user: visitors upload with approval, approval by SQL, Neon and Prisma, photo + text + date, a single delivery at the end, RLS on every table and snake_case mapping.

- 2026-10-01: T1 done (route: delegated writer, 2+ non-trivial files).
  - Prisma 7.10 with `@prisma/adapter-neon` (WebSocket `Pool`, so interactive transactions work; the HTTP adapter has none). `prisma-client` generator into `src/generated/prisma` (gitignored), generated by `postinstall` and before `build`. pnpm build approval for `prisma` and `@prisma/engines` is set in `pnpm-workspace.yaml` (`allowBuilds`).
  - `prisma.config.ts` reads `DIRECT_URL` without `env()`, so `generate` and `build` pass with no database variables.
  - Migration `20261001000000_init`: enum and `memories` table (snake_case), the `app_user` role (`NOLOGIN NOBYPASSRLS`, idempotent), column-level `INSERT` grant, `ENABLE` + `FORCE` RLS with a select and an insert policy, and `_prisma_migrations` locked down. It was generated offline; nothing touched Neon.
  - `src/features/memories`: domain, `validateNewMemory`, `MemoryRepository` port and the Prisma adapter. `src/shared/db`: lazy client, `withVisitor`, `assertRuntimeRole`, plus static lints for the migration SQL and `schema.prisma`.
  - Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
  - Commit `f0d981f`. The RDD review (medium; the slice budget was reached) was granted.
    - It found one critical issue: `getPrisma()` never cached the client in production, so every repository call opened a new client and WebSocket pool.
    - Fixed in `36f2623` (route: inline, one file plus its test). The client is now cached in every environment, covered by `client.test.ts`. RED was observed on the production case.
    - Targeted validation approved; lineage `review-44f696e6128708f0` acknowledged. Reviewed boundary: `36f2623`.

- 2026-10-01: T2 done (route: delegated writer, 2+ non-trivial files).
  - `src/shared/session` (`server-only`): `signSession` and `verifySession` (HMAC-SHA256, constant-time compare, strict payload `{ h, exp }`, handle checked with the gate's `isValidHandle`), `getSessionSecret` (at least 32 decoded bytes, else not configured), cookie constants and options, and `currentVisitor()`, which also re-checks the handle against `AccessPolicy` so removing it from the whitelist revokes the session.
  - Cookie `ml_visitor`: `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, 30 days.
  - The gate action now goes through `admitVisitor` (`src/features/gate/access/admit-visitor.ts`). A denied or invalid handle gets no cookie. With no valid `SESSION_SECRET` it still admits, skips the cookie and logs one handle-free warning.

## T6 checklist (run only after the user authorizes remote operations)

1. As the owner (`DIRECT_URL`), run `prisma migrate deploy`. It creates the tables, `app_user` (no login) and the policies.
2. As the owner, run `ALTER ROLE app_user LOGIN PASSWORD '<generated secret>';` with SQL. The password never goes in the repo.
3. Build the pooled `app_user` URL (same host, `app_user` and the new password) and set it as `DATABASE_URL` in `.env.local` and Vercel. `DIRECT_URL` stays the owner's unpooled URL. The runtime guard throws if `DATABASE_URL` uses the owner.
4. Generate the session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and add it as `SESSION_SECRET` to `.env.local` and Vercel. The user does this, not an agent. Without it the gate still admits, but sets no session cookie.
5. Check with `app_user`: it reads only approved rows, inserts only pending rows under its own handle, and cannot update or delete.

## Next step

T3: orb.
