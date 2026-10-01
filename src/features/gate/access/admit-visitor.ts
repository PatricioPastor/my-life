import "server-only"
import {
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionCookieOptions,
} from "@/shared/session/session-cookie"
import { signSession } from "@/shared/session/session-token"
import type { AccessPolicy } from "./access-policy"
import { checkAccess, type AccessResult } from "./check-access"
import { normalizeHandle } from "../handle"

export interface AdmitDeps {
  policy: AccessPolicy
  secret: string | null
  /** Milliseconds, like `Date.now`. */
  now: () => number
  setCookie: (name: string, value: string, options: SessionCookieOptions) => void
  warn: (message: string) => void
}

/**
 * Gate decision plus session: an admitted handle also gets a signed cookie.
 * A missing secret never blocks entry; it only skips the cookie and warns,
 * without the handle, so logs carry no PII.
 */
export async function admitVisitor(rawHandle: string, deps: AdmitDeps): Promise<AccessResult> {
  const result = await checkAccess(rawHandle, deps.policy)
  if (result.status !== "granted") return result

  if (!deps.secret) {
    deps.warn("SESSION_SECRET is missing or shorter than 32 bytes: admitted a visitor without a session cookie.")
    return result
  }
  const exp = Math.floor(deps.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const token = signSession({ h: normalizeHandle(rawHandle), exp }, deps.secret)
  deps.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
  return result
}
