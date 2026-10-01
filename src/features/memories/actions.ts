"use server"

import { randomUUID } from "node:crypto"
import { currentVisitor, getSessionSecret } from "@/features/gate/session"
import { CloudinaryAdminAssets, readCloudinaryConfig } from "./cloudinary-admin-assets"
import { createMemoryWith } from "./create-memory"
import { listMemoriesWith } from "./list-memories"
import type { ListMemoriesResult } from "./memory-view"
import { prepareUploadWith } from "./prepare-upload"
import { PrismaMemoryRepository } from "./prisma-memory-repository"
import type { CreateMemoryInput, CreateMemoryResult, PrepareUploadResult } from "./upload-view"

const log = (message: string) => console.warn(`[memories] ${message}`)

/** The memories the current visitor may see. The database is only reached from here, on the server. */
export async function listMemories(): Promise<ListMemoriesResult> {
  return listMemoriesWith({
    currentVisitor,
    repository: () => new PrismaMemoryRepository(),
    cloudinary: readCloudinaryConfig(),
    log,
  })
}

/** Step 1 of adding a memory: the signed parameters for a direct upload to Cloudinary, plus an upload ticket. */
export async function prepareUpload(): Promise<PrepareUploadResult> {
  return prepareUploadWith({
    currentVisitor,
    repository: () => new PrismaMemoryRepository(),
    cloudinary: readCloudinaryConfig(),
    ticketSecret: getSessionSecret(),
    now: Date.now,
    newId: randomUUID,
    log,
  })
}

/** Step 2: verifies the uploaded photo on the server and stores the memory as pending. */
export async function createMemory(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  const config = readCloudinaryConfig()
  return createMemoryWith(
    {
      currentVisitor,
      repository: () => new PrismaMemoryRepository(),
      assets: () => {
        if (!config) throw new Error("Cloudinary is not configured.")
        return new CloudinaryAdminAssets(config)
      },
      cloudinary: config,
      ticketSecret: getSessionSecret(),
      now: Date.now,
      log,
    },
    input,
  )
}
