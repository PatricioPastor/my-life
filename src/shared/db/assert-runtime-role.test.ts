import { describe, expect, it } from "vitest"
import { assertRuntimeRole } from "./assert-runtime-role"

const url = (user: string, host = "ep-x-pooler.neon.tech") =>
  `postgresql://${user}:secret@${host}/db?sslmode=require`

describe("assertRuntimeRole", () => {
  it("accepts a restricted runtime role", () => {
    expect(() => assertRuntimeRole(url("app_user"))).not.toThrow()
  })

  it("accepts a restricted role when it differs from the direct role", () => {
    expect(() =>
      assertRuntimeRole(url("app_user"), url("neondb_owner", "ep-x.neon.tech")),
    ).not.toThrow()
  })

  it("rejects neondb_owner", () => {
    expect(() => assertRuntimeRole(url("neondb_owner"))).toThrow(/owner/i)
  })

  it("rejects postgres", () => {
    expect(() => assertRuntimeRole(url("postgres"))).toThrow(/owner/i)
  })

  it("rejects the same role as DIRECT_URL, whatever it is", () => {
    expect(() => assertRuntimeRole(url("migrator"), url("migrator", "ep-x.neon.tech"))).toThrow(
      /DIRECT_URL/,
    )
  })

  it("decodes percent-encoded usernames", () => {
    expect(() => assertRuntimeRole(url("neondb%5Fowner"))).toThrow(/owner/i)
  })

  it("never echoes the connection string in the error", () => {
    expect(() => assertRuntimeRole(url("neondb_owner"))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret") }),
    )
  })

  it("rejects an unparsable URL without leaking it", () => {
    expect(() => assertRuntimeRole("not a url with secret")).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret") }),
    )
  })

  it("ignores an unparsable DIRECT_URL", () => {
    expect(() => assertRuntimeRole(url("app_user"), "garbage")).not.toThrow()
  })
})
