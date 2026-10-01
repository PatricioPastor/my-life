import { currentVisitor } from "@/features/gate/session"
import { readCloudinaryConfig } from "@/features/memories/cloudinary-admin-assets"
import { PrismaMemoryRepository } from "@/features/memories/prisma-memory-repository"
import { serveAudioWith } from "@/features/memories/serve-audio"

/**
 * The audio of a memory, streamed with byte ranges (see `serveAudioWith`). Dynamic on purpose: it depends on the
 * visitor's session cookie and the `Range` header, and `/` stays static. It reads no files (no `fs`, nothing to trace).
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return serveAudioWith(
    {
      currentVisitor,
      repository: () => new PrismaMemoryRepository(),
      cloudinary: readCloudinaryConfig(),
      fetch,
      log: (message) => console.warn(`[memories] ${message}`),
    },
    { id, range: request.headers.get("range"), signal: request.signal },
  )
}
