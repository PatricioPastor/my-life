"use server"

import { randomUUID } from "node:crypto"
import { currentVisitor, getSessionSecret } from "@/features/gate/session"
import { resolveSiteUrl } from "@/shared/site/site-url"
import { CloudinaryAdminAssets, readCloudinaryConfig } from "./cloudinary-admin-assets"
import { createMemoryWith } from "./create-memory"
import { readMaxAudioBytes } from "./max-audio-bytes"
import { listMemoriesWith } from "./list-memories"
import { followShortLink } from "./place/follow-short-link"
import { getReverseGeocoder } from "./place/geocoder"
import { resolveMapsLinkWith, type ResolveMapsLinkResult } from "./place/resolve-maps-link"
import { suggestPlaceWith, type SuggestPlaceResult } from "./place/suggest-place"
import type { ListMemoriesResult } from "./memory-view"
import { prepareUploadWith } from "./prepare-upload"
import { shareMemoryWith } from "./share/share-memory"
import type { ShareMemoryResult } from "./share/share-view"
import { PrismaMemoryRepository } from "./prisma-memory-repository"
import type { CreateMemoryInput, CreateMemoryResult, PrepareUploadInput, PrepareUploadResult } from "./upload-view"

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

/**
 * Step 1 of adding a memory: the signed parameters for the direct uploads to Cloudinary (a photo, an audio or both,
 * as asked), plus one upload ticket that covers them.
 */
export async function prepareUpload(input: PrepareUploadInput): Promise<PrepareUploadResult> {
  return prepareUploadWith(
    {
      currentVisitor,
      repository: () => new PrismaMemoryRepository(),
      cloudinary: readCloudinaryConfig(),
      ticketSecret: getSessionSecret(),
      now: Date.now,
      newId: randomUUID,
      log,
    },
    input,
  )
}

/** Step 2: verifies the uploaded photo and/or audio on the server and stores the memory as pending. */
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
      maxAudioBytes: readMaxAudioBytes(),
      now: Date.now,
      geocoder: getReverseGeocoder,
      follow: (url) => followShortLink(url),
      log,
    },
    input,
  )
}

/**
 * Names the place of a photo's GPS position, for the "where was it taken" suggestion. The server rounds the position to
 * 2 decimals before it asks Nominatim; a failed lookup answers `{ ok: true, label: null }`.
 */
export async function suggestPlace(input: { lat: number; lng: number }): Promise<SuggestPlaceResult> {
  return suggestPlaceWith({ currentVisitor, geocoder: getReverseGeocoder, log }, input)
}

/**
 * Reads a pasted Google Maps link (full or short) on the server and answers with the exact position and a short
 * label. Short links are followed only through the SSRF-guarded follower. `createMemory` resolves the link again.
 */
export async function resolveMapsLink(input: { url: string }): Promise<ResolveMapsLinkResult> {
  return resolveMapsLinkWith({ currentVisitor, follow: (url) => followShortLink(url), geocoder: getReverseGeocoder, log }, input)
}

/**
 * The link to share an approved memory. Needs a session; a pending or rejected memory, or one the visitor cannot see,
 * has no link. The server signs the token (see `signShareToken`): the client never builds one.
 */
export async function shareMemory(input: { id: string }): Promise<ShareMemoryResult> {
  return shareMemoryWith(
    {
      currentVisitor,
      repository: () => new PrismaMemoryRepository(),
      secret: getSessionSecret(),
      siteUrl: resolveSiteUrl(process.env),
      log,
    },
    input,
  )
}
