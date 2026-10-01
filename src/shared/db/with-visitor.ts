import "server-only"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"

/** What `withVisitor` needs from a client: interactive transactions. */
export type TransactionRunner = Pick<PrismaClient, "$transaction">

/**
 * Runs `fn` in an interactive transaction whose row-level security policies see `handle` as the
 * visitor. `set_config(..., true)` is transaction-local, so the handle cannot leak to the next
 * user of a pooled connection. The handle is a bound parameter, never interpolated into SQL.
 *
 * Every write the visitor can make goes through here; the policies read it with
 * `current_setting('app.handle', true)`.
 */
export function withVisitor<T>(
  db: TransactionRunner,
  handle: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.handle', ${handle}, true)`
    return fn(tx)
  })
}
