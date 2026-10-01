import "server-only"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@/generated/prisma/client"
import { assertRuntimeRole } from "./assert-runtime-role"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Lazy Prisma client singleton. Nothing connects at import time or during `next build`: the
 * client is created on first use, and the Neon adapter opens its WebSocket pool on first query.
 *
 * Uses the pooled DATABASE_URL, which must belong to the restricted `app_user` role (checked
 * here), over `PrismaNeon` (a WebSocket pool) because interactive transactions, which
 * `withVisitor` needs, are not supported by the HTTP adapter.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set.")
  assertRuntimeRole(connectionString, process.env.DIRECT_URL)

  const client = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })
  // Keep one client across dev hot reloads; in production each instance builds its own once.
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client
  return client
}
