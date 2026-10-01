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
  owner     Owner    @relation(fields: [handle], references: [id])
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
})

describe("prisma/schema.prisma (exact location)", () => {
  const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")

  it("stores the exact position as numeric(9,6) in latitude and longitude, with no approximate columns left", () => {
    expect(source).toMatch(/latitude\s+Decimal\?\s+@db\.Decimal\(9,\s*6\)/)
    expect(source).toMatch(/longitude\s+Decimal\?\s+@db\.Decimal\(9,\s*6\)/)
    expect(source).not.toMatch(/approx/i)
  })
})

describe("prisma/schema.prisma", () => {
  it("is fully snake_case mapped", () => {
    const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")
    expect(lintPrismaSchema(source)).toEqual([])
  })
})
