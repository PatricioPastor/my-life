/**
 * Where the browser plays the audio of a memory from: our own route, never Cloudinary. The route checks the session,
 * reads the memory as the visitor (row-level security), and streams the signed Cloudinary audio back with byte ranges,
 * so the signed URL never reaches the browser. Safe to import anywhere (no server code).
 */
export const memoryAudioPath = (memoryId: string): string => `/api/memories/${encodeURIComponent(memoryId)}/audio`

/**
 * Where a guest plays the audio of a shared memory from: a route of its own, gated by the share token (no session).
 * Kept apart from {@link memoryAudioPath}, so the session route never has a second way in.
 */
export const sharedAudioPath = (token: string): string => `/api/memories/shared/${encodeURIComponent(token)}/audio`
