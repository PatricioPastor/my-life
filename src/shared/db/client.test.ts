import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

const created = vi.hoisted(() => ({ clients: 0, adapters: 0 }))

vi.mock("@prisma/adapter-neon", () => ({
  PrismaNeon: class {
    constructor() {
      created.adapters++
    }
  },
}))

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      created.clients++
    }
  },
}))

const APP_URL = "postgresql://app_user:secret@ep-x-pooler.neon.tech/neondb"

beforeEach(() => {
  vi.resetModules()
  created.clients = 0
  created.adapters = 0
  delete (globalThis as { prisma?: unknown }).prisma
  vi.stubEnv("DATABASE_URL", APP_URL)
  vi.stubEnv("DIRECT_URL", "postgresql://neondb_owner:secret@ep-x.neon.tech/neondb")
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete (globalThis as { prisma?: unknown }).prisma
})

describe("getPrisma", () => {
  it.each(["production", "development"])("builds one client and one pool per instance in %s", async (env) => {
    vi.stubEnv("NODE_ENV", env)
    const { getPrisma } = await import("./client")
    const first = getPrisma()
    expect(getPrisma()).toBe(first)
    expect(getPrisma()).toBe(first)
    expect(created.clients).toBe(1)
    expect(created.adapters).toBe(1)
  })

  it("refuses to build a client as the owner role", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:secret@ep-x-pooler.neon.tech/neondb")
    const { getPrisma } = await import("./client")
    expect(() => getPrisma()).toThrow()
    expect(created.clients).toBe(0)
  })

  it("fails clearly when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "")
    const { getPrisma } = await import("./client")
    expect(() => getPrisma()).toThrow("DATABASE_URL is not set.")
  })
})
