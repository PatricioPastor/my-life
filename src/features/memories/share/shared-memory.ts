import "server-only"
import { cache } from "react"
import { getSessionSecret } from "@/features/gate/session"
import { readCloudinaryConfig } from "../cloudinary-admin-assets"
import { PrismaMemoryRepository } from "../prisma-memory-repository"
import { findSharedMemoryWith } from "./find-shared-memory"
import type { SharedMemoryResult } from "./share-view"

/**
 * The memory a share link opens, read as a guest (the `app_user` connection, approved rows only). Wrapped in React's
 * `cache`, so the page and its `generateMetadata` share one read per request.
 */
export const findSharedMemory = cache(
  (token: string): Promise<SharedMemoryResult> =>
    findSharedMemoryWith(
      {
        secret: getSessionSecret(),
        repository: () => new PrismaMemoryRepository(),
        cloudinary: readCloudinaryConfig(),
        log: (message) => console.warn(`[memories] ${message}`),
      },
      token,
    ),
)
