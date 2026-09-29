import { describe, expect, it, vi } from "vitest"
import { checkAccess } from "./check-access"
import type { AccessPolicy } from "./access-policy"

const policyFor = (allowed: string[]): AccessPolicy => ({
  isAllowed: vi.fn(async (h: string) => allowed.includes(h)),
})

describe("checkAccess", () => {
  it("grants an allowed handle", async () => {
    expect(await checkAccess("@Ana", policyFor(["ana"]))).toEqual({ status: "granted" })
  })

  it("denies a handle that is not allowed", async () => {
    expect(await checkAccess("eve", policyFor(["ana"]))).toEqual({ status: "denied" })
  })

  it("re-validates and never asks the policy about malformed input", async () => {
    const policy = policyFor(["a-b"])
    expect(await checkAccess("a-b", policy)).toEqual({ status: "invalid" })
    expect(await checkAccess("   ", policy)).toEqual({ status: "invalid" })
    expect(policy.isAllowed).not.toHaveBeenCalled()
  })

  it("passes the normalized handle to the policy", async () => {
    const policy = policyFor(["ana"])
    await checkAccess(" @ANA ", policy)
    expect(policy.isAllowed).toHaveBeenCalledWith("ana")
  })

  it("treats non-string input as invalid", async () => {
    expect(await checkAccess(42 as unknown as string, policyFor([]))).toEqual({ status: "invalid" })
  })
})
