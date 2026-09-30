import { normalizeHandle } from "../handle"

import { OWNER_HANDLE } from "@/shared/site/owner"

export { OWNER_HANDLE }

export interface AccessRequest {
  href: string
  message: string
}

export function buildAccessRequest(handle: string): AccessRequest {
  return {
    href: `https://ig.me/m/${OWNER_HANDLE}`,
    message: `¡Hola! Me gustaría entrar a tu sitio. Mi Instagram es @${normalizeHandle(handle)}.`,
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
