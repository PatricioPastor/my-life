"use server"

import { cookies } from "next/headers"
import { getSessionSecret } from "@/shared/session/session-secret"
import { admitVisitor } from "./access/admit-visitor"
import type { AccessResult } from "./access/check-access"
import { EnvWhitelistPolicy } from "./access/env-whitelist-policy"

export async function checkHandle(rawHandle: string): Promise<AccessResult> {
  const store = await cookies()
  return admitVisitor(rawHandle, {
    policy: new EnvWhitelistPolicy(),
    secret: getSessionSecret(),
    now: Date.now,
    setCookie: (name, value, options) => store.set(name, value, options),
    warn: (message) => console.warn(`[gate] ${message}`),
  })
}
