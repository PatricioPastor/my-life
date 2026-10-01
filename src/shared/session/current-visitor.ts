import "server-only"
import { cookies } from "next/headers"
import type { AccessPolicy } from "@/features/gate/access/access-policy"
import { EnvWhitelistPolicy } from "@/features/gate/access/env-whitelist-policy"
import { SESSION_COOKIE } from "./session-cookie"
import { getSessionSecret } from "./session-secret"
import { verifySession } from "./session-token"

export interface Visitor {
  handle: string
}

export interface CurrentVisitorDeps {
  readCookie: (name: string) => string | undefined
  secret: string | null
  /** Milliseconds, like `Date.now`. */
  now: () => number
  policy: AccessPolicy
}

/** A valid token is not enough: the handle must still pass the policy, so removing it revokes the session. */
export async function currentVisitorWith(deps: CurrentVisitorDeps): Promise<Visitor | null> {
  const token = deps.readCookie(SESSION_COOKIE)
  if (!token || !deps.secret) return null
  const payload = verifySession(token, deps.secret, Math.floor(deps.now() / 1000))
  if (!payload) return null
  return (await deps.policy.isAllowed(payload.h)) ? { handle: payload.h } : null
}

/** Default wiring: request cookies, SESSION_SECRET, the system clock and the env whitelist. */
export async function currentVisitor(): Promise<Visitor | null> {
  const store = await cookies()
  return currentVisitorWith({
    readCookie: (name) => store.get(name)?.value,
    secret: getSessionSecret(),
    now: Date.now,
    policy: new EnvWhitelistPolicy(),
  })
}
