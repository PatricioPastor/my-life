// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const serve = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response("ok", { status: 206 }))
vi.mock("@/features/memories/serve-audio", () => ({ serveSharedAudioWith: (...args: unknown[]) => serve(...args) }))
vi.mock("@/features/memories/prisma-memory-repository", () => ({ PrismaMemoryRepository: class {} }))
vi.mock("@/features/memories/cloudinary-admin-assets", () => ({ readCloudinaryConfig: () => ({ cloudName: "demo", apiSecret: "s" }) }))
vi.mock("@/features/gate/session", () => ({ getSessionSecret: () => "the-secret", currentVisitor: vi.fn() }))

import { GET, dynamic } from "./route"

describe("GET /api/memories/shared/[token]/audio", () => {
  it("is dynamic: it depends on the token and the Range header, so it is never prerendered", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("hands the token and the Range header to the shared audio, and never reads a session", async () => {
    const request = new Request("http://localhost/api/memories/shared/tok.en/audio", { headers: { range: "bytes=0-9" } })
    const res = await GET(request, { params: Promise.resolve({ token: "tok.en" }) })
    expect(res.status).toBe(206)
    const [deps, input] = serve.mock.calls[0] as [{ secret: string }, { token: string; range: string | null }]
    expect(deps.secret).toBe("the-secret")
    expect(input).toMatchObject({ token: "tok.en", range: "bytes=0-9" })
  })
})
