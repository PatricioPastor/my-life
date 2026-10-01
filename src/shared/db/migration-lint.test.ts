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
