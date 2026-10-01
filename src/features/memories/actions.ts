"use server"

import { currentVisitor } from "@/features/gate/session"
import { listMemoriesWith } from "./list-memories"
import type { ListMemoriesResult } from "./memory-view"
import { PrismaMemoryRepository } from "./prisma-memory-repository"

/** The memories the current visitor may see. The database is only reached from here, on the server. */
export async function listMemories(): Promise<ListMemoriesResult> {
  return listMemoriesWith({
    currentVisitor,
    repository: () => new PrismaMemoryRepository(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    log: (message) => console.warn(`[memories] ${message}`),
  })
}
