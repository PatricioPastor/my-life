// @vitest-environment node
/**
 * Runs every migration, in order, against a real PostgreSQL (PGlite: Postgres compiled to WASM, in memory, offline)
 * and checks the row-level security the application relies on, as the runtime role.
 *
 * What PGlite models faithfully: parsing and planning (including the policy expansion that raised "infinite recursion
 * detected in policy" for a policy that subqueried its own table), policies, column grants, constraints, foreign keys
 * and triggers, and SECURITY DEFINER functions.
 *
 * What it cannot model, and the stand-in:
 *  - Neon's owner role has BYPASSRLS but is not a superuser. PGlite's only login role is a superuser, which bypasses
 *    row-level security too. The effect that matters here (the owner of a SECURITY DEFINER function is not filtered by
 *    the FORCEd policies) is the same. Privileges the owner would lack as a non-superuser are not exercised.
 *  - `_prisma_migrations` is created by Prisma itself before the first migration, so the test creates a stub of it.
 *  - A single connection: every check is its own transaction, rolled back, with `SET LOCAL ROLE app_user` and
 *    `set_config('app.handle', ..., true)`, the shape `withVisitor` uses.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations")

const APPROVED = "00000000-0000-4000-8000-000000000001" // alice's approved memory
const PENDING_OTHER = "00000000-0000-4000-8000-000000000002" // bob's pending memory
const PENDING_OWN = "00000000-0000-4000-8000-000000000003" // carol's own pending memory
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff"

interface Failure {
  code?: string
  message: string
}
type Outcome<T> = { ok: true; value: T } | { ok: false; error: Failure }

let db: PGlite

/** Runs `work` in a transaction as app_user with the visitor's handle, then rolls everything back. */
async function asVisitor<T>(handle: string | null, work: (tx: Pick<PGlite, "query">) => Promise<T>): Promise<Outcome<T>> {
  let outcome: Outcome<T> | undefined
  await db.transaction(async (tx) => {
    try {
      await tx.exec("SET LOCAL ROLE app_user")
      if (handle !== null) await tx.query("SELECT set_config('app.handle', $1, true)", [handle])
      outcome = { ok: true, value: await work(tx) }
    } catch (error) {
      const failure = error as Failure
      outcome = { ok: false, error: { code: failure.code, message: failure.message } }
    }
    await tx.rollback()
  })
  return outcome!
}

const insertMemory = (handle: string, extra = "", values = "") =>
  `INSERT INTO memories (handle, public_id, caption, happened_on, width, height${extra})
   VALUES ('${handle}', 'pid-' || gen_random_uuid(), 'a caption', '2026-01-01', 10, 10${values}) RETURNING id`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE "_prisma_migrations" ("id" varchar(36) PRIMARY KEY)`)
  for (const name of readdirSync(MIGRATIONS_DIR).sort()) {
    if (name === "migration_lock.toml") continue
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"))
  }
  const seed = (id: string, handle: string, status: string) =>
    db.query(
      `INSERT INTO memories (id, handle, public_id, caption, happened_on, width, height, status)
       VALUES ($1::uuid, $2, 'seed-' || $1::text, 'seed', '2026-01-01', 10, 10, $3::memory_status)`,
      [id, handle, status],
    )
  await seed(APPROVED, "alice", "approved")
  await seed(PENDING_OTHER, "bob", "pending")
  await seed(PENDING_OWN, "carol", "pending")
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe("the harness", () => {
  it("does detect the recursion PostgreSQL raises for a policy that subqueries its own table inside a policy", async () => {
    const scratch = new PGlite()
    try {
      await scratch.exec(`
        CREATE ROLE reader NOLOGIN;
        CREATE TABLE t (id int PRIMARY KEY, parent int);
        ALTER TABLE t ENABLE ROW LEVEL SECURITY;
        ALTER TABLE t FORCE ROW LEVEL SECURITY;
        GRANT SELECT ON t TO reader;
        CREATE POLICY t_select ON t FOR SELECT TO reader
          USING (parent IS NULL OR EXISTS (SELECT 1 FROM t AS p WHERE p.id = t.parent));`)
      await scratch.exec("SET ROLE reader")
      await expect(scratch.query("SELECT * FROM t")).rejects.toThrow(/infinite recursion detected in policy for relation "t"/)
    } finally {
      await scratch.close()
    }
  })
})

describe("memories insert policy against a real PostgreSQL", () => {
  it("accepts the insert the code live before the migration issues (the new columns omitted)", async () => {
    const result = await asVisitor("carol", (tx) => tx.query(insertMemory("carol")))
    expect(result).toMatchObject({ ok: true })
  })

  it("accepts an explicit NULL relation", async () => {
    const result = await asVisitor("carol", (tx) => tx.query(insertMemory("carol", ', "related_memory_id"', ", NULL")))
    expect(result).toMatchObject({ ok: true })
  })

  it("accepts a relation to an approved memory", async () => {
    const result = await asVisitor("carol", (tx) =>
      tx.query(insertMemory("carol", ', "related_memory_id"', `, '${APPROVED}'`)),
    )
    expect(result).toMatchObject({ ok: true })
  })

  it("refuses a relation to a pending memory (even the visitor's own), another visitor's pending one and an unknown id, with the same error", async () => {
    const errors = []
    for (const target of [PENDING_OWN, PENDING_OTHER, UNKNOWN]) {
      const result = await asVisitor("carol", (tx) =>
        tx.query(insertMemory("carol", ', "related_memory_id"', `, '${target}'`)),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) errors.push(result.error)
    }
    expect(errors.map((e) => e.code)).toEqual(["42501", "42501", "42501"])
    expect(new Set(errors.map((e) => e.message)).size).toBe(1)
    expect(errors[0].message).toContain("row-level security")
  })

  it("still refuses a row under another handle, or one that is not pending", async () => {
    const other = await asVisitor("carol", (tx) => tx.query(insertMemory("bob")))
    expect(other).toMatchObject({ ok: false, error: { code: "42501" } })
    const approved = await asVisitor("carol", (tx) => tx.query(insertMemory("carol", ", status", ", 'approved'")))
    expect(approved.ok).toBe(false)
  })
})

describe("the address", () => {
  it("is stored with a position and refused without one", async () => {
    const withPosition = await asVisitor("carol", (tx) =>
      tx.query(insertMemory("carol", ', "latitude", "longitude", "location_source", "place_address"', ", -34.6, -58.4, 'photo', 'Av. Rivadavia 1234, Junín'")),
    )
    expect(withPosition).toMatchObject({ ok: true })
    const without = await asVisitor("carol", (tx) =>
      tx.query(insertMemory("carol", ', "place_address"', ", 'Av. Rivadavia 1234, Junín'")),
    )
    expect(without).toMatchObject({ ok: false })
    expect(without.ok === false && without.error.message).toContain("memories_place_address_needs_location")
  })
})

describe("the time a memory happened", () => {
  it("is inserted by app_user under row-level security and read back as the same wall clock", async () => {
    const result = await asVisitor("carol", async (tx) => {
      const inserted = await tx.query<{ id: string }>(insertMemory("carol", ', "happened_time"', ", '18:42'"))
      const read = await tx.query<{ happened_time: string | null }>(
        "SELECT happened_time::text AS happened_time FROM memories WHERE id = $1",
        [inserted.rows[0].id],
      )
      return read.rows
    })
    expect(result).toEqual({ ok: true, value: [{ happened_time: "18:42:00" }] })
  })

  it("cannot be changed by app_user once the memory is saved (no UPDATE grant)", async () => {
    const result = await asVisitor("carol", (tx) =>
      tx.query(`UPDATE memories SET happened_time = '07:05' WHERE id = '${PENDING_OWN}'`),
    )
    expect(result).toMatchObject({ ok: false, error: { code: "42501" } })
  })
})

describe("what app_user can and cannot do", () => {
  it("cannot UPDATE related_memory_id (no grant)", async () => {
    const result = await asVisitor("carol", (tx) =>
      tx.query(`UPDATE memories SET related_memory_id = '${APPROVED}' WHERE id = '${PENDING_OWN}'`),
    )
    expect(result).toMatchObject({ ok: false, error: { code: "42501" } })
  })

  it("cannot see another visitor's pending memory, and sees approved ones", async () => {
    const result = await asVisitor("carol", (tx) => tx.query<{ id: string }>("SELECT id FROM memories ORDER BY id"))
    expect(result.ok && result.value.rows.map((r) => r.id)).toEqual([APPROVED, PENDING_OWN])
  })

  it("sees nothing of its own without a handle set", async () => {
    const result = await asVisitor(null, (tx) => tx.query<{ id: string }>("SELECT id FROM memories"))
    expect(result.ok && result.value.rows.map((r) => r.id)).toEqual([APPROVED])
  })
})

describe("the relation when the parent goes away", () => {
  it("deleting the parent (as the owner) nulls the child's related_memory_id", async () => {
    await db.query(`INSERT INTO memories (id, handle, public_id, caption, happened_on, width, height, status)
      VALUES ('00000000-0000-4000-8000-0000000000a1', 'alice', 'parent', 'p', '2026-01-01', 10, 10, 'approved')`)
    await db.query(`INSERT INTO memories (id, handle, public_id, caption, happened_on, width, height, related_memory_id)
      VALUES ('00000000-0000-4000-8000-0000000000a2', 'carol', 'child', 'c', '2026-01-01', 10, 10, '00000000-0000-4000-8000-0000000000a1')`)
    await db.query(`DELETE FROM memories WHERE id = '00000000-0000-4000-8000-0000000000a1'`)
    const { rows } = await db.query<{ related_memory_id: string | null }>(
      `SELECT related_memory_id FROM memories WHERE id = '00000000-0000-4000-8000-0000000000a2'`,
    )
    expect(rows).toEqual([{ related_memory_id: null }])
  })
})

describe("memory views (previous feature) are unaffected", () => {
  const upsert = `INSERT INTO memory_views (memory_id, handle) VALUES ('${APPROVED}', $1)
    ON CONFLICT (memory_id, handle) DO UPDATE SET open_count = memory_views.open_count + 1, last_viewed_at = now()
    RETURNING open_count`

  it("counts a first open of an approved memory, and bumps open_count on a repeat", async () => {
    const result = await asVisitor("carol", async (tx) => {
      await tx.query(upsert, ["carol"])
      const again = await tx.query<{ open_count: number }>(upsert, ["carol"])
      const memory = await tx.query<{ view_count: number }>(`SELECT view_count FROM memories WHERE id = '${APPROVED}'`)
      return { open: again.rows[0].open_count, views: memory.rows[0].view_count }
    })
    expect(result).toMatchObject({ ok: true, value: { open: 2, views: 1 } })
  })

  it("refuses the author, and a pending memory", async () => {
    const author = await asVisitor("alice", (tx) => tx.query(upsert, ["alice"]))
    expect(author).toMatchObject({ ok: false, error: { code: "42501" } })
    const pending = await asVisitor("carol", (tx) =>
      tx.query(`INSERT INTO memory_views (memory_id, handle) VALUES ('${PENDING_OTHER}', 'carol')`),
    )
    expect(pending).toMatchObject({ ok: false })
  })
})
