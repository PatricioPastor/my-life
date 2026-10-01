// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { lintMigration } from "./migration-lint"

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations")

function migrationFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return migrationFiles(full)
    return name === "migration.sql" ? [full] : []
  })
}

describe("lintMigration (rules)", () => {
  const good = `
CREATE TABLE "things" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "things_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "things_created_at_idx" ON "things"("created_at");
ALTER TABLE "things" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "things" FORCE ROW LEVEL SECURITY;
CREATE POLICY things_select ON "things" FOR SELECT TO app_user USING (true);
`

  it("accepts a compliant migration", () => {
    expect(lintMigration(good)).toEqual([])
  })

  it("flags a table without ENABLE", () => {
    expect(lintMigration(good.replace(/ALTER TABLE "things" ENABLE.*\n/, ""))).toContainEqual(
      expect.stringContaining("ENABLE ROW LEVEL SECURITY"),
    )
  })

  it("flags a table without FORCE", () => {
    expect(lintMigration(good.replace(/ALTER TABLE "things" FORCE.*\n/, ""))).toContainEqual(
      expect.stringContaining("FORCE ROW LEVEL SECURITY"),
    )
  })

  it("flags a table without a policy", () => {
    expect(lintMigration(good.replace(/CREATE POLICY.*\n/, ""))).toContainEqual(
      expect.stringContaining("CREATE POLICY"),
    )
  })

  it("flags camelCase tables, columns, indexes and types", () => {
    const bad = `
CREATE TYPE "memoryStatus" AS ENUM ('a');
CREATE TABLE "myThings" (
    "createdAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "myThings_idx" ON "myThings"("createdAt");
`
    const problems = lintMigration(bad).join("\n")
    for (const id of ["memoryStatus", "myThings", "createdAt", "myThings_idx"]) {
      expect(problems).toContain(id)
    }
  })

  it("ignores comments", () => {
    expect(lintMigration(`-- CREATE TABLE "BadName" (x int);\n${good}`)).toEqual([])
  })

  it("flags camelCase columns added to an existing table", () => {
    expect(lintMigration(`ALTER TABLE "things" ADD COLUMN "takenAt" TIMESTAMPTZ(3);`).join("\n")).toContain("takenAt")
    expect(lintMigration(`ALTER TABLE "things" ADD COLUMN "taken_at" TIMESTAMPTZ(3);`)).toEqual([])
    expect(
      lintMigration(`ALTER TABLE "things" ADD COLUMN "a_b" INTEGER, ADD COLUMN "cD" INTEGER;`).join("\n"),
    ).toContain("cD")
  })

  it("flags a migration that turns row-level security off", () => {
    expect(lintMigration(`ALTER TABLE "things" DISABLE ROW LEVEL SECURITY;`).join("\n")).toContain("DISABLE")
    expect(lintMigration(`ALTER TABLE "things" NO FORCE ROW LEVEL SECURITY;`).join("\n")).toContain("NO FORCE")
  })

  it("flags grants that let app_user or PUBLIC update, delete or do everything", () => {
    for (const grant of [
      `GRANT UPDATE ON "things" TO app_user;`,
      `GRANT UPDATE ("a") ON "things" TO app_user;`,
      `GRANT DELETE ON "things" TO app_user;`,
      `GRANT ALL ON "things" TO app_user;`,
      `GRANT ALL PRIVILEGES ON "things" TO PUBLIC;`,
      `GRANT SELECT, INSERT ON "things" TO PUBLIC;`,
    ]) {
      expect(lintMigration(grant), grant).not.toEqual([])
    }
    expect(lintMigration(`GRANT SELECT ON "things" TO app_user;
GRANT INSERT ("a_b") ON "things" TO app_user;`)).toEqual([])
  })

  it("flags an INSERT grant on a column the database must fill (id, status, created_at)", () => {
    for (const column of ["id", "status", "created_at"]) {
      expect(lintMigration(`GRANT INSERT ("a", "${column}") ON "things" TO app_user;`).join("\n")).toContain(column)
    }
  })

  it("exempts _prisma_migrations from the CREATE TABLE rules", () => {
    expect(lintMigration(`CREATE TABLE "_prisma_migrations" ("id" int);`)).toEqual([])
  })
})

describe("migrations on disk", () => {
  const files = migrationFiles(MIGRATIONS_DIR)

  it("has at least one migration", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))(
    "%s follows the rules",
    (_label, file) => {
      expect(lintMigration(readFileSync(file, "utf8"))).toEqual([])
    },
  )
})

describe("the photo details migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_photo_details"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the init migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261001000000_init").toBe(true)
  })

  it("adds the snake_case columns and the media_kind enum, and touches no other table", () => {
    expect(code).toContain(`CREATE TYPE "media_kind" AS ENUM ('image')`)
    for (const column of [
      "kind",
      "format",
      "bytes",
      "taken_at",
      "dominant_color",
      "palette",
      "metadata",
      "approx_latitude",
      "approx_longitude",
    ]) {
      expect(code).toMatch(new RegExp(`ADD\\s+COLUMN\\s+"${column}"`))
    }
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("grants app_user INSERT on exactly the new columns it must write", () => {
    const grant = /GRANT\s+INSERT\s*\(([^)]*)\)\s+ON\s+"memories"\s+TO\s+app_user/i.exec(code)
    expect(grant).not.toBeNull()
    const columns = grant![1].split(",").map((c) => c.trim().replace(/"/g, ""))
    expect(columns.sort()).toEqual(
      [
        "approx_latitude",
        "approx_longitude",
        "bytes",
        "dominant_color",
        "format",
        "kind",
        "metadata",
        "palette",
        "taken_at",
      ].sort(),
    )
  })

  it("leaves row-level security and the other grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i)
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL|SELECT)/i)
    expect(code).not.toMatch(/TO\s+PUBLIC/i)
  })

  it("keeps the approximate location inside the globe and always paired", () => {
    expect(code).toMatch(/approx_latitude"?\s+BETWEEN\s+-90\s+AND\s+90/i)
    expect(code).toMatch(/approx_longitude"?\s+BETWEEN\s+-180\s+AND\s+180/i)
    expect(code).toMatch(/approx_latitude"?\s+IS\s+NULL\)\s*=\s*\(?"?approx_longitude"?\s+IS\s+NULL/i)
  })
})

describe("the place migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_place"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the photo details migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261001120000_memory_photo_details").toBe(true)
  })

  it("adds the snake_case place columns and the location_source enum, and touches no other table", () => {
    expect(code).toContain(`CREATE TYPE "location_source" AS ENUM ('photo', 'link')`)
    expect(code).toMatch(/ADD\s+COLUMN\s+"place_name"\s+VARCHAR\(120\)/i)
    expect(code).toMatch(/ADD\s+COLUMN\s+"location_source"\s+"location_source"/i)
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("grants app_user INSERT on exactly the two new columns", () => {
    const grant = /GRANT\s+INSERT\s*\(([^)]*)\)\s+ON\s+"memories"\s+TO\s+app_user/i.exec(code)
    expect(grant).not.toBeNull()
    const columns = grant![1].split(",").map((c) => c.trim().replace(/"/g, ""))
    expect(columns.sort()).toEqual(["location_source", "place_name"])
  })

  it("keeps the source set if and only if the coordinates are, and the name only with coordinates", () => {
    expect(code).toMatch(/location_source"?\s+IS\s+NULL\)\s*=\s*\(?"?approx_latitude"?\s+IS\s+NULL/i)
    expect(code).toMatch(/place_name"?\s+IS\s+NULL\s+OR\s+"?approx_latitude"?\s+IS\s+NOT\s+NULL/i)
  })

  it("leaves row-level security and the other grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i)
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL|SELECT)/i)
    expect(code).not.toMatch(/TO\s+PUBLIC/i)
  })
})
