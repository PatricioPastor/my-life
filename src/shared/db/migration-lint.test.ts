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

  it("flags a column renamed to a camelCase name", () => {
    expect(lintMigration(`ALTER TABLE "things" RENAME COLUMN "approx_latitude" TO "exactLatitude";`).join("\n")).toContain(
      "exactLatitude",
    )
    expect(lintMigration(`ALTER TABLE "things" RENAME COLUMN "approx_latitude" TO "latitude";`)).toEqual([])
  })

  it("flags a constraint renamed to a camelCase name", () => {
    expect(
      lintMigration(`ALTER TABLE "things" RENAME CONSTRAINT "things_a_range" TO "thingsARange";`).join("\n"),
    ).toContain("thingsARange")
    expect(lintMigration(`ALTER TABLE "things" RENAME CONSTRAINT "things_a_range" TO "things_b_range";`)).toEqual([])
  })

  it("flags DROP POLICY: replace a policy with ALTER POLICY, so the table is never left without it (default-deny breaks the live code)", () => {
    expect(lintMigration(`DROP POLICY things_insert ON "things";`).join(" ")).toContain("ALTER POLICY")
    expect(lintMigration(`DROP POLICY IF EXISTS things_insert ON "things";`)).not.toEqual([])
    expect(lintMigration(`ALTER POLICY things_insert ON "things" WITH CHECK (true);`)).toEqual([])
  })

  it("flags a migration that turns row-level security off", () => {
    expect(lintMigration(`ALTER TABLE "things" DISABLE ROW LEVEL SECURITY;`).join("\n")).toContain("DISABLE")
    expect(lintMigration(`ALTER TABLE "things" NO FORCE ROW LEVEL SECURITY;`).join("\n")).toContain("NO FORCE")
  })

  it("flags grants that let app_user or PUBLIC update, delete or do everything", () => {
    for (const grant of [
      `GRANT UPDATE ON "things" TO app_user;`,
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

  it("allows UPDATE only per column, and never on the identity columns or on memories", () => {
    expect(lintMigration(`GRANT UPDATE ("last_viewed_at", "open_count") ON "things" TO app_user;`)).toEqual([])
    expect(lintMigration(`GRANT UPDATE ON "things" TO app_user;`).join("\n")).toContain("table-wide UPDATE")
    for (const column of ["id", "handle", "memory_id", "status", "created_at"]) {
      expect(lintMigration(`GRANT UPDATE ("a", "${column}") ON "things" TO app_user;`).join("\n"), column).toContain(column)
    }
    expect(lintMigration(`GRANT UPDATE ("caption") ON "memories" TO app_user;`).join("\n")).toContain("memories")
    expect(lintMigration(`GRANT SELECT, UPDATE ("a") ON "things" TO PUBLIC;`)).not.toEqual([])
  })

  it("never allows DELETE, not even next to a column-level UPDATE", () => {
    expect(lintMigration(`GRANT UPDATE ("a"), DELETE ON "things" TO app_user;`).join("\n")).toContain("DELETE")
  })

  describe("SECURITY DEFINER functions", () => {
    const fn = (attributes: string, extra = "") => `
CREATE FUNCTION "bump_things"() RETURNS trigger
LANGUAGE plpgsql ${attributes}
AS $$
BEGIN
  UPDATE "things" SET "n" = "n" + 1;
  RETURN NEW;
END;
$$;
${extra}`
    const revoke = `REVOKE EXECUTE ON FUNCTION "bump_things"() FROM PUBLIC;`

    it("accepts one that pins search_path and revokes EXECUTE from PUBLIC", () => {
      expect(lintMigration(fn("SECURITY DEFINER SET search_path = public, pg_temp", revoke))).toEqual([])
    })

    it("flags one without SET search_path", () => {
      expect(lintMigration(fn("SECURITY DEFINER", revoke)).join("\n")).toContain("search_path")
    })

    it("reads the attributes after the body too", () => {
      const after = `
CREATE FUNCTION "bump_things"() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
${revoke}`
      expect(lintMigration(after)).toEqual([])
      expect(lintMigration(after.replace("SET search_path = public, pg_temp", "")).join("\n")).toContain("search_path")
    })

    it("flags one that leaves EXECUTE with PUBLIC", () => {
      expect(lintMigration(fn("SECURITY DEFINER SET search_path = public, pg_temp")).join("\n")).toContain("REVOKE")
    })

    it("does not look at a plain (invoker) function, nor at a comment", () => {
      expect(lintMigration(fn(""))).toEqual([])
      expect(lintMigration(`-- CREATE FUNCTION x() ... SECURITY DEFINER\n${good}`)).toEqual([])
    })
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

describe("the exact location migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_exact_location"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the place migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261001180000_memory_place").toBe(true)
  })

  it("widens the position to numeric(9,6) and touches no other table", () => {
    expect(code).toMatch(/ALTER\s+COLUMN\s+"approx_latitude"\s+SET\s+DATA\s+TYPE\s+DECIMAL\(9,\s*6\)/i)
    expect(code).toMatch(/ALTER\s+COLUMN\s+"approx_longitude"\s+SET\s+DATA\s+TYPE\s+DECIMAL\(9,\s*6\)/i)
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("renames the columns and their constraints so nothing says approximate any more", () => {
    expect(code).toMatch(/RENAME\s+COLUMN\s+"approx_latitude"\s+TO\s+"latitude"/i)
    expect(code).toMatch(/RENAME\s+COLUMN\s+"approx_longitude"\s+TO\s+"longitude"/i)
    expect(code).toMatch(/RENAME\s+CONSTRAINT\s+"memories_approx_latitude_range"\s+TO\s+"memories_latitude_range"/i)
    expect(code).toMatch(/RENAME\s+CONSTRAINT\s+"memories_approx_longitude_range"\s+TO\s+"memories_longitude_range"/i)
    expect(code).toMatch(/RENAME\s+CONSTRAINT\s+"memories_approx_location_paired"\s+TO\s+"memories_location_paired"/i)
  })

  it("drops no column and no data", () => {
    expect(code).not.toMatch(/DROP\s+COLUMN|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i)
  })

  it("keeps the range and pairing checks, and only restates the app_user INSERT on the two renamed columns", () => {
    // The checks follow the rename; nothing here drops or recreates them with a weaker rule.
    expect(code).not.toMatch(/DROP\s+CONSTRAINT/i)
    const grant = /GRANT\s+INSERT\s*\(([^)]*)\)\s+ON\s+"memories"\s+TO\s+app_user/i.exec(code)
    expect(grant).not.toBeNull()
    const columns = grant![1].split(",").map((c) => c.trim().replace(/"/g, ""))
    expect(columns.sort()).toEqual(["latitude", "longitude"])
  })

  it("leaves row-level security and the other grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i)
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL|SELECT)/i)
    expect(code).not.toMatch(/TO\s+PUBLIC/i)
  })
})

describe("the orb color migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_orb_color"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the exact location migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261002000000_memory_exact_location").toBe(true)
  })

  it("adds one snake_case varchar(7) column, nullable so older rows stay valid, and touches no other table", () => {
    expect(code).toMatch(/ADD\s+COLUMN\s+"orb_color"\s+VARCHAR\(7\)\s*;/i)
    expect(code).not.toMatch(/orb_color"?\s+VARCHAR\(7\)\s+NOT\s+NULL/i)
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("only accepts a lowercase #rrggbb (or nothing)", () => {
    expect(code).toMatch(/CONSTRAINT\s+"memories_orb_color_hex"\s+CHECK\s*\(\s*"orb_color"\s+IS\s+NULL\s+OR\s+"orb_color"\s+~\s+'\^#\[0-9a-f\]\{6\}\$'\s*\)/i)
  })

  it("grants app_user INSERT on exactly the new column", () => {
    const grant = /GRANT\s+INSERT\s*\(([^)]*)\)\s+ON\s+"memories"\s+TO\s+app_user/i.exec(code)
    expect(grant).not.toBeNull()
    expect(grant![1].split(",").map((c) => c.trim().replace(/"/g, ""))).toEqual(["orb_color"])
  })

  it("leaves row-level security and the other grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i)
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL|SELECT)/i)
    expect(code).not.toMatch(/TO\s+PUBLIC/i)
  })
})

describe("the voice memories migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_audio"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the orb color migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261002010000_memory_orb_color").toBe(true)
  })

  it("passes the migration lint and touches no other table", () => {
    expect(lintMigration(sql)).toEqual([])
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("adds the snake_case audio columns, all nullable, and a unique audio public id", () => {
    for (const column of ["audio_public_id", "audio_format", "audio_bytes", "audio_duration_ms"]) {
      expect(code).toMatch(new RegExp(`ADD\\s+COLUMN\\s+"${column}"\\s+(TEXT|INTEGER)\\s*(,|;)`, "i"))
    }
    expect(code).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+"memories_audio_public_id_key"\s+ON\s+"memories"\s*\(\s*"audio_public_id"\s*\)/i)
  })

  it("is expand-only: it relaxes NOT NULL on the photo columns and never renames or drops anything", () => {
    for (const column of ["public_id", "width", "height"]) {
      expect(code).toMatch(new RegExp(`ALTER\\s+COLUMN\\s+"${column}"\\s+DROP\\s+NOT\\s+NULL`, "i"))
    }
    expect(code).not.toMatch(/DROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX|TYPE)|RENAME|DELETE\s+FROM|TRUNCATE|SET\s+NOT\s+NULL|ALTER\s+TYPE/i)
  })

  it("requires a photo or an audio, and keeps each one's columns together", () => {
    expect(code).toMatch(/CONSTRAINT\s+"memories_has_media"\s+CHECK\s*\(\s*"public_id"\s+IS\s+NOT\s+NULL\s+OR\s+"audio_public_id"\s+IS\s+NOT\s+NULL\s*\)/i)
    expect(code).toMatch(/CONSTRAINT\s+"memories_photo_paired"/i)
    expect(code).toMatch(/CONSTRAINT\s+"memories_audio_paired"/i)
  })

  it("bounds the audio duration and size", () => {
    expect(code).toMatch(/CONSTRAINT\s+"memories_audio_duration_range"\s+CHECK[^;]*"audio_duration_ms"[^;]*BETWEEN\s+1\s+AND\s+125000/i)
    expect(code).toMatch(/CONSTRAINT\s+"memories_audio_bytes_range"\s+CHECK[^;]*"audio_bytes"[^;]*BETWEEN\s+1\s+AND\s+15728640/i)
  })

  it("grants app_user INSERT on exactly the four new columns", () => {
    const grant = /GRANT\s+INSERT\s*\(([^)]*)\)\s+ON\s+"memories"\s+TO\s+app_user/i.exec(code)
    expect(grant).not.toBeNull()
    const columns = grant![1].split(",").map((c) => c.trim().replace(/"/g, ""))
    expect(columns.sort()).toEqual(["audio_bytes", "audio_duration_ms", "audio_format", "audio_public_id"])
  })

  it("leaves row-level security and the other grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY/i)
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL|SELECT)/i)
    expect(code).not.toMatch(/TO\s+PUBLIC/i)
  })
})

describe("the long audio migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_long_audio"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the voice memories migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261003000000_memory_audio").toBe(true)
  })

  it("passes the migration lint and touches no other table", () => {
    expect(lintMigration(sql)).toEqual([])
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("only drops and re-adds the two audio range checks: no column, table, index or data is touched", () => {
    const dropped = [...code.matchAll(/DROP\s+CONSTRAINT\s+"?(\w+)"?/gi)].map((m) => m[1]).sort()
    expect(dropped).toEqual(["memories_audio_bytes_range", "memories_audio_duration_range"])
    const added = [...code.matchAll(/ADD\s+CONSTRAINT\s+"?(\w+)"?/gi)].map((m) => m[1]).sort()
    expect(added).toEqual(dropped)
    expect(code).not.toMatch(/DROP\s+(COLUMN|TABLE|INDEX|TYPE)|RENAME|ADD\s+COLUMN|ALTER\s+COLUMN|DELETE\s+FROM|TRUNCATE|ALTER\s+TYPE|CREATE\s+/i)
  })

  it("allows up to 3,605,000 ms (60 minutes plus the recorder drift) and the 2,000,000,000 byte backstop", () => {
    expect(code).toMatch(/ADD\s+CONSTRAINT\s+"memories_audio_duration_range"\s+CHECK[^;,]*"audio_duration_ms"[^;]*BETWEEN\s+1\s+AND\s+3605000/i)
    expect(code).toMatch(/ADD\s+CONSTRAINT\s+"memories_audio_bytes_range"\s+CHECK[^;,]*"audio_bytes"[^;]*BETWEEN\s+1\s+AND\s+2000000000/i)
  })

  it("keeps every old row valid: the new bounds contain the old ones (125,000 ms and 15 MB)", () => {
    const duration = /"audio_duration_ms"[^;]*BETWEEN\s+1\s+AND\s+(\d+)/i.exec(code)?.[1]
    const bytes = /"audio_bytes"[^;]*BETWEEN\s+1\s+AND\s+(\d+)/i.exec(code)?.[1]
    expect(Number(duration)).toBeGreaterThanOrEqual(125000)
    expect(Number(bytes)).toBeGreaterThanOrEqual(15728640)
  })

  it("leaves row-level security and the grants alone", () => {
    expect(code).not.toMatch(/ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY|DROP\s+POLICY|GRANT|REVOKE/i)
  })
})

describe("the memory views migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_views"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")
  const norm = code.replace(/\s+/g, " ")
  const columnsOf = (privilege: string) => {
    const grant = new RegExp(`GRANT\\s+${privilege}\\s*\\(([^)]*)\\)\\s+ON\\s+"memory_views"\\s+TO\\s+app_user`, "i").exec(code)
    return grant ? grant[1].split(",").map((c) => c.trim().replace(/"/g, "")).sort() : null
  }

  it("exists and sorts after the long audio migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261004000000_memory_long_audio").toBe(true)
  })

  it("passes the migration lint", () => {
    expect(lintMigration(sql)).toEqual([])
  })

  it("creates memory_views with a cascading foreign key, a unique pair and an index on memory_id", () => {
    expect(norm).toMatch(/CREATE TABLE "memory_views"/)
    expect(norm).toMatch(/"id" UUID NOT NULL DEFAULT gen_random_uuid\(\)/i)
    expect(norm).toMatch(/"memory_id" UUID NOT NULL/)
    expect(norm).toMatch(/"handle" VARCHAR\(30\) NOT NULL/)
    expect(norm).toMatch(/"first_viewed_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT now\(\)/i)
    expect(norm).toMatch(/"last_viewed_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT now\(\)/i)
    expect(norm).toMatch(/"open_count" INTEGER NOT NULL DEFAULT 1/)
    expect(norm).toMatch(/CREATE UNIQUE INDEX "memory_views_memory_id_handle_key" ON "memory_views"\("memory_id", "handle"\)/)
    expect(norm).toMatch(/CREATE INDEX "memory_views_memory_id_idx" ON "memory_views"\("memory_id"\)/)
    expect(norm).toMatch(/FOREIGN KEY \("memory_id"\) REFERENCES "memories"\("id"\) ON DELETE CASCADE/)
    expect(norm).toMatch(/CHECK \("open_count" > 0\)/)
  })

  it("enables and forces row-level security, with the three own-row policies for app_user and none for DELETE", () => {
    expect(norm).toMatch(/ALTER TABLE "memory_views" ENABLE ROW LEVEL SECURITY/)
    expect(norm).toMatch(/ALTER TABLE "memory_views" FORCE ROW LEVEL SECURITY/)
    for (const command of ["SELECT", "INSERT", "UPDATE"]) {
      expect(norm, command).toMatch(new RegExp(`CREATE POLICY \\w+ ON "memory_views" FOR ${command} TO app_user`))
    }
    expect(code).not.toMatch(/CREATE\s+POLICY\s+\w+\s+ON\s+"memory_views"\s+FOR\s+(DELETE|ALL)/i)
    const own = /handle\s*=\s*NULLIF\(current_setting\('app\.handle',\s*true\),\s*''\)/gi
    // SELECT, INSERT, UPDATE USING and UPDATE WITH CHECK.
    expect([...code.matchAll(own)].length).toBeGreaterThanOrEqual(4)
  })

  it("lets an insert through only for an approved memory the visitor did not write", () => {
    expect(norm).toMatch(
      /FOR INSERT TO app_user WITH CHECK \( handle = NULLIF\(current_setting\('app\.handle', true\), ''\) AND EXISTS \( SELECT 1 FROM "memories" m WHERE m\.id = memory_id AND m\.status = 'approved' AND m\.handle <> NULLIF\(current_setting\('app\.handle', true\), ''\) \) \)/,
    )
  })

  it("grants app_user column-level INSERT, UPDATE and SELECT, and never DELETE", () => {
    expect(columnsOf("INSERT")).toEqual(["handle", "memory_id"])
    expect(columnsOf("UPDATE")).toEqual(["last_viewed_at", "open_count"])
    expect(columnsOf("SELECT")).toEqual(["first_viewed_at", "handle", "last_viewed_at", "memory_id", "open_count"])
    expect(code).not.toMatch(/GRANT[^;]*\b(DELETE|ALL)\b|TO\s+PUBLIC/i)
    // Every grant on the table is one of those three column-level ones.
    expect([...code.matchAll(/GRANT\s+(\w+)\s*\(/gi)].map((m) => m[1].toUpperCase()).sort()).toEqual(["INSERT", "SELECT", "UPDATE"])
    expect([...code.matchAll(/GRANT\s+\w+\s+ON\s+"memory_views"/gi)]).toEqual([])
  })

  it("adds memories.view_count as a non-negative integer that defaults to 0, and grants app_user nothing more on memories", () => {
    expect(norm).toMatch(/ALTER TABLE "memories" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0/)
    expect(norm).toMatch(/CONSTRAINT "memories_view_count_non_negative" CHECK \("view_count" >= 0\)/)
    expect(code).not.toMatch(/GRANT[^;]*ON\s+"memories"/i)
  })

  it("counts through an owner-owned SECURITY DEFINER trigger with a pinned search_path, run only after a real INSERT", () => {
    expect(norm).toMatch(/CREATE FUNCTION "memory_views_count_view"\(\) RETURNS trigger/)
    expect(norm).toMatch(/SECURITY DEFINER/)
    expect(norm).toMatch(/SET search_path = public, pg_temp/)
    expect(norm).toMatch(/UPDATE "memories" SET "view_count" = "view_count" \+ 1 WHERE "id" = NEW\."memory_id"/)
    expect(norm).toMatch(/REVOKE (ALL|EXECUTE) ON FUNCTION "memory_views_count_view"\(\) FROM PUBLIC/)
    expect(norm).toMatch(
      /CREATE TRIGGER "memory_views_count_view" AFTER INSERT ON "memory_views" FOR EACH ROW EXECUTE FUNCTION "memory_views_count_view"\(\)/,
    )
    expect(code).not.toMatch(/AFTER\s+(UPDATE|DELETE)|INSERT\s+OR\s+UPDATE/i)
  })

  it("is expand-only: nothing is dropped, renamed or emptied", () => {
    expect(code).not.toMatch(/DROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX|TYPE|POLICY)|RENAME|DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN/i)
  })
})

describe("the related memory and address migration", () => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_memory_related_and_address"))
  const sql = dir ? readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8") : ""
  const code = sql.replace(/--[^\n]*/g, "")

  it("exists and sorts after the views migration", () => {
    expect(dir).toBeDefined()
    expect(dir! > "20261005000000_memory_views").toBe(true)
  })

  it("passes the migration lint and touches no other table", () => {
    expect(lintMigration(sql)).toEqual([])
    expect([...code.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?/gi)].every((m) => m[1] === "memories")).toBe(true)
  })

  it("is expand-only: two nullable columns, an index and a foreign key that sets null, and nothing renamed or dropped", () => {
    expect(code).toMatch(/ADD\s+COLUMN\s+"place_address"\s+VARCHAR\(200\)\s*,/i)
    expect(code).toMatch(/ADD\s+COLUMN\s+"related_memory_id"\s+UUID\s*;/i)
    expect(code).not.toMatch(/"\s+(UUID|VARCHAR\(\d+\))\s+NOT\s+NULL/i)
    expect(code).toMatch(/CREATE\s+INDEX\s+"memories_related_memory_id_idx"\s+ON\s+"memories"\s*\(\s*"related_memory_id"\s*\)/i)
    expect(code).toMatch(/FOREIGN\s+KEY\s*\("related_memory_id"\)\s+REFERENCES\s+"memories"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/i)
    expect(code).not.toMatch(/DROP\s+(COLUMN|TABLE|CONSTRAINT|INDEX|TYPE|POLICY)|RENAME|DELETE\s+FROM|TRUNCATE|SET\s+NOT\s+NULL|ALTER\s+TYPE/i)
  })

  it("grants app_user INSERT on exactly the two new columns, and nothing else", () => {
    const grants = [...code.matchAll(/GRANT\s+([^;]*?)\s+ON\s+"memories"\s+TO\s+(\w+)/gi)]
    expect(grants).toHaveLength(1)
    expect(grants[0][2]).toBe("app_user")
    const columns = /^INSERT\s*\(([^)]*)\)$/i
      .exec(grants[0][1].trim())![1]
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""))
    expect(columns.sort()).toEqual(["place_address", "related_memory_id"])
    expect(code).not.toMatch(/GRANT\s+(UPDATE|DELETE|ALL)|TO\s+PUBLIC/i)
  })

  it("only lets an address describe a stored location", () => {
    expect(code).toMatch(/"place_address"\s+IS\s+NULL\s+OR\s+"latitude"\s+IS\s+NOT\s+NULL/i)
  })

  describe("the insert policy", () => {
    const policy =
      /ALTER\s+POLICY\s+memories_insert\s+ON\s+"memories"\s+WITH\s+CHECK\s*\(([\s\S]*?)\);\s*$/i.exec(code.trim())?.[1] ?? ""

    it("is altered in place, not dropped, and still requires a pending row under the visitor's own handle", () => {
      expect(policy).not.toBe("")
      expect(policy).toMatch(/status\s*=\s*'pending'/)
      expect(policy).toMatch(/handle\s*=\s*NULLIF\(current_setting\('app\.handle',\s*true\),\s*''\)/)
    })

    it("accepts a row without a relation (everything the code live today inserts)", () => {
      expect(policy).toMatch(/"memories"\."related_memory_id"\s+IS\s+NULL\s+OR/)
    })

    it("accepts a relation only to an approved memory, naming the new row's column so it cannot bind to the subquery's table", () => {
      expect(policy).toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+"memories"\s+AS\s+related/i)
      expect(policy).toMatch(/related\.id\s*=\s*"memories"\."related_memory_id"/)
      expect(policy).toMatch(/related\.status\s*=\s*'approved'/)
      // Every mention of the new row's column carries the table name.
      expect(policy.match(/related_memory_id/g)).toHaveLength(policy.match(/"memories"\."related_memory_id"/g)!.length)
    })
  })
})
