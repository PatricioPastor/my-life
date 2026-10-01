/** Owner-level roles the runtime must never connect as (they have BYPASSRLS on Neon). */
const FORBIDDEN_ROLES: ReadonlySet<string> = new Set(["neondb_owner", "postgres"])

function usernameOf(connectionString: string | undefined): string | undefined {
  if (!connectionString) return undefined
  try {
    return decodeURIComponent(new URL(connectionString).username)
  } catch {
    return undefined
  }
}

/**
 * Pure guard: row-level security is only a boundary if the runtime connects as a restricted
 * role. Throws when DATABASE_URL uses an owner role or the same role as DIRECT_URL (the
 * migration owner). Error messages never include the connection string.
 */
export function assertRuntimeRole(databaseUrl: string, directUrl?: string): void {
  const runtimeUser = usernameOf(databaseUrl)
  if (!runtimeUser) {
    throw new Error("DATABASE_URL is not a valid connection URL with a username.")
  }
  if (FORBIDDEN_ROLES.has(runtimeUser)) {
    throw new Error(
      `DATABASE_URL must use the restricted app_user role, not the owner role "${runtimeUser}": the owner bypasses row-level security.`,
    )
  }
  if (runtimeUser === usernameOf(directUrl)) {
    throw new Error(
      "DATABASE_URL and DIRECT_URL use the same role: the runtime must not connect as the migration owner.",
    )
  }
}
