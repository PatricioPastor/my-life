import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { EnvWhitelistPolicy, parseWhitelist } from "./env-whitelist-policy"

describe("parseWhitelist", () => {
  it("splits on commas and newlines", () => {
    expect(parseWhitelist("a,b\nc\r\nd")).toEqual(["a", "b", "c", "d"])
  })

  it("normalizes @ prefixes, case and spaces", () => {
    expect(parseWhitelist(" @Ana , B_b ")).toEqual(["ana", "b_b"])
  })

  it("drops blanks", () => {
    expect(parseWhitelist(",, \n,@,")).toEqual([])
  })

  it("treats missing input as empty", () => {
    expect(parseWhitelist(undefined)).toEqual([])
  })
})

describe("EnvWhitelistPolicy", () => {
  it("allows listed handles, case-insensitively", async () => {
    const policy = new EnvWhitelistPolicy("@Ana,bob")
    expect(await policy.isAllowed("ana")).toBe(true)
    expect(await policy.isAllowed("BOB")).toBe(true)
  })

  it("denies unlisted handles", async () => {
    const policy = new EnvWhitelistPolicy("ana")
    expect(await policy.isAllowed("eve")).toBe(false)
  })

  it("denies everyone when the list is empty or missing", async () => {
    expect(await new EnvWhitelistPolicy("").isAllowed("ana")).toBe(false)
    expect(await new EnvWhitelistPolicy(undefined).isAllowed("ana")).toBe(false)
    expect(await new EnvWhitelistPolicy(" , ").isAllowed("")).toBe(false)
  })
})
