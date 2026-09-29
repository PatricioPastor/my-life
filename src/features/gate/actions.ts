"use server"

import { checkAccess, type AccessResult } from "./access/check-access"
import { EnvWhitelistPolicy } from "./access/env-whitelist-policy"

export async function checkHandle(rawHandle: string): Promise<AccessResult> {
  return checkAccess(rawHandle, new EnvWhitelistPolicy())
}
