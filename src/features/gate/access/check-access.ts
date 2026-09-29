import { isValidHandle, normalizeHandle } from "../handle"
import type { AccessPolicy } from "./access-policy"

export interface AccessResult {
  status: "granted" | "denied" | "invalid"
}

/** Server-side gate: re-validates the raw input, never trusting what the client already checked. */
export async function checkAccess(rawHandle: string, policy: AccessPolicy): Promise<AccessResult> {
  const handle = normalizeHandle(typeof rawHandle === "string" ? rawHandle : "")
  if (!isValidHandle(handle)) return { status: "invalid" }
  return { status: (await policy.isAllowed(handle)) ? "granted" : "denied" }
}
