import { getSessionSecret } from "@/features/gate/session"
import { readCloudinaryConfig } from "@/features/memories/cloudinary-admin-assets"
import { PrismaMemoryRepository } from "@/features/memories/prisma-memory-repository"
import { serveSharedAudioWith } from "@/features/memories/serve-audio"

/**
 * The audio of a shared memory for a guest: no session, the share token in the path is the credential, and it can only
 * reach that one memory's audio (see `serveSharedAudioWith`). Dynamic on purpose: it depends on the token and the `Range`
 * header, and `/` stays static. It reads no files (no `fs`, nothing to trace).
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params
  return serveSharedAudioWith(
    {
      secret: getSessionSecret(),
      repository: () => new PrismaMemoryRepository(),
      cloudinary: readCloudinaryConfig(),
      fetch,
      log: (message) => console.warn(`[memories] ${message}`),
    },
    { token, range: request.headers.get("range"), signal: request.signal },
  )
}
