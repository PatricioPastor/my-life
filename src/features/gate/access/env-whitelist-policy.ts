import "server-only"
import { normalizeHandle } from "../handle"
import type { AccessPolicy } from "./access-policy"

/** Comma and/or newline separated; blanks dropped. */
export function parseWhitelist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map(normalizeHandle)
    .filter(Boolean)
}

/** Adapter over INSTAGRAM_WHITELIST. An empty or missing list denies everyone. */
export class EnvWhitelistPolicy implements AccessPolicy {
  private readonly allowed: ReadonlySet<string>

  constructor(raw: string | undefined = process.env.INSTAGRAM_WHITELIST) {
    this.allowed = new Set(parseWhitelist(raw))
  }

  async isAllowed(handle: string): Promise<boolean> {
    const h = normalizeHandle(handle)
    return h !== "" && this.allowed.has(h)
  }
}
