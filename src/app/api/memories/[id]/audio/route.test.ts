// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const currentVisitor = vi.fn(async (): Promise<{ handle: string } | null> => null)
vi.mock("@/features/gate/session", () => ({ currentVisitor: () => currentVisitor() }))

import { GET, dynamic } from "./route"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/memories/[id]/audio", () => {
  it("is dynamic: it reads the session cookie and the Range header, so it is never prerendered", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("answers 401 without a session, with no body and nothing cacheable", async () => {
    currentVisitor.mockResolvedValueOnce(null)
    const res = await GET(new Request("http://localhost/api/memories/11111111-1111-4111-8111-111111111111/audio"), context("11111111-1111-4111-8111-111111111111"))
    expect(res.status).toBe(401)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.text()).toBe("")
  })

  it("answers 404 for an id that is not a uuid before it reads anything", async () => {
    currentVisitor.mockResolvedValueOnce({ handle: "ana" })
    const res = await GET(new Request("http://localhost/api/memories/nope/audio"), context("nope"))
    expect(res.status).toBe(404)
  })
})
