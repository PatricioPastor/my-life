import { describe, expect, it } from "vitest"
import { OWNER_HANDLE } from "@/features/gate/access/access-request"
import { buildSecurityTxt } from "./security-txt"

const NOW = new Date("2026-09-30T12:00:00.000Z")

describe("buildSecurityTxt", () => {
  const body = buildSecurityTxt({ siteUrl: "https://example.com", now: NOW })

  it("lists the required RFC 9116 fields", () => {
    expect(body).toContain("Preferred-Languages: es, en\n")
    expect(body).toContain("Canonical: https://example.com/.well-known/security.txt\n")
  })

  it("derives the contact from the owner handle", () => {
    expect(body).toContain(`Contact: https://ig.me/m/${OWNER_HANDLE}\n`)
  })

  it("expires 364 days after now, in ISO 8601 UTC", () => {
    expect(body).toContain("Expires: 2027-09-29T12:00:00.000Z\n")
  })

  it("never publishes an email address", () => {
    expect(body).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]/i)
  })
})
