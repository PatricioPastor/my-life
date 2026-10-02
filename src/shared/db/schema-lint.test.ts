// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { lintPrismaSchema } from "./schema-lint"

describe("lintPrismaSchema (rules)", () => {
  const good = `
enum MemoryStatus {
  pending
  @@map("memory_status")
}
model Memory {
  id        String   @id
  publicId  String   @map("public_id")
  handle    String
  owner     Owner    @relation(fields: [handle], references: [id], onDelete: Restrict)
  @@map("memories")
}
model Owner {
  id String @id
  @@map("owners")
}
`

  it("accepts a compliant schema", () => {
    expect(lintPrismaSchema(good)).toEqual([])
  })

  it("flags a model without @@map", () => {
    expect(lintPrismaSchema(good.replace(`@@map("memories")`, ""))).toContainEqual(
      expect.stringContaining("Memory"),
    )
  })

  it("flags an enum without @@map", () => {
    expect(lintPrismaSchema(good.replace(`@@map("memory_status")`, ""))).toContainEqual(
      expect.stringContaining("MemoryStatus"),
    )
  })

  it("flags a camelCase field without @map", () => {
    expect(lintPrismaSchema(good.replace(` @map("public_id")`, ""))).toContainEqual(
      expect.stringContaining("publicId"),
    )
  })

  it("flags an @map that is not snake_case", () => {
    expect(lintPrismaSchema(good.replace(`"public_id"`, `"publicId"`))).toContainEqual(
      expect.stringContaining("publicId"),
    )
  })

  it("flags a @@map that is not snake_case", () => {
    expect(lintPrismaSchema(good.replace(`"memories"`, `"Memories"`))).toContainEqual(
      expect.stringContaining("Memories"),
    )
  })

  it("does not require @map on relation fields", () => {
    expect(lintPrismaSchema(good.replace("owner     Owner", "ownerRef  Owner"))).toEqual([])
  })

  it("flags a relation that does not say what happens on delete", () => {
    const problems = lintPrismaSchema(good.replace(", onDelete: Restrict", ""))
    expect(problems).toContainEqual(expect.stringContaining("owner"))
    expect(problems.join("\n")).toContain("onDelete")
    expect(lintPrismaSchema(good.replace("Restrict", "Cascade"))).toEqual([])
  })

  it("only looks at the owning side of a relation (the one with fields)", () => {
    expect(lintPrismaSchema(good.replace(`  @@map("owners")`, `  things Memory[]\n  @@map("owners")`))).toEqual([])
  })
})

describe("prisma/schema.prisma (exact location)", () => {
  const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")

  it("stores the exact position as numeric(9,6) in latitude and longitude, with no approximate columns left", () => {
    expect(source).toMatch(/latitude\s+Decimal\?\s+@db\.Decimal\(9,\s*6\)/)
    expect(source).toMatch(/longitude\s+Decimal\?\s+@db\.Decimal\(9,\s*6\)/)
    expect(source).not.toMatch(/approx/i)
  })
})

describe("prisma/schema.prisma (orb color)", () => {
  const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")

  it("keeps the orb color in a nullable, mapped varchar(7) column", () => {
    expect(source).toMatch(/orbColor\s+String\?\s+@map\("orb_color"\)\s+@db\.VarChar\(7\)/)
  })
})

describe("prisma/schema.prisma (memory views)", () => {
  const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")
  const block = /model MemoryViewRecord \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ""

  it("keeps the counter on memories as a DB-defaulted, mapped integer", () => {
    expect(source).toMatch(/viewCount\s+Int\s+@default\(dbgenerated\("0"\)\)\s+@map\("view_count"\)/)
  })

  it("maps one row per memory and handle to memory_views, cascading from the memory", () => {
    expect(block).not.toBe("")
    expect(block).toMatch(/@@map\("memory_views"\)/)
    expect(block).toMatch(/@@unique\(\[memoryId, handle\]/)
    expect(block).toMatch(/@@index\(\[memoryId\]/)
    expect(block).toMatch(/@relation\(fields: \[memoryId\], references: \[id\], onDelete: Cascade\)/)
    expect(block).toMatch(/openCount\s+Int\s+@default\(dbgenerated\("1"\)\)\s+@map\("open_count"\)/)
    expect(block).toMatch(/firstViewedAt\s+DateTime\s+@default\(dbgenerated\("now\(\)"\)\)\s+@map\("first_viewed_at"\)\s+@db\.Timestamptz\(3\)/)
    expect(block).toMatch(/lastViewedAt\s+DateTime\s+@default\(dbgenerated\("now\(\)"\)\)\s+@map\("last_viewed_at"\)\s+@db\.Timestamptz\(3\)/)
  })
})

describe("prisma/schema.prisma", () => {
  it("is fully snake_case mapped", () => {
    const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")
    expect(lintPrismaSchema(source)).toEqual([])
  })
})
