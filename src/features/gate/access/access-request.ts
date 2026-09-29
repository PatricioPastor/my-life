import { normalizeHandle } from "../handle"

// Public site config, not a secret: where access requests are received.
export const OWNER_HANDLE = "patriciopastor_"

export interface AccessRequest {
  href: string
  message: string
}

export function buildAccessRequest(handle: string): AccessRequest {
  return {
    href: `https://ig.me/m/${OWNER_HANDLE}`,
    message: `Hi! I'd like access to your site. My Instagram is @${normalizeHandle(handle)}.`,
  }
}

/** Best effort: a missing or rejected clipboard resolves false and never throws. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
