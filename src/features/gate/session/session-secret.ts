import "server-only"

const MIN_SECRET_BYTES = 32
const BASE64_ANY = /^[A-Za-z0-9_+/-]+={0,2}$/

/**
 * Reads SESSION_SECRET (base64 or base64url). Valid only when it decodes to at
 * least 32 bytes; anything else is "not configured" and yields null.
 */
export function getSessionSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.SESSION_SECRET?.trim()
  if (!raw || !BASE64_ANY.test(raw)) return null
  return Buffer.from(raw, "base64url").length >= MIN_SECRET_BYTES ? raw : null
}
