/**
 * Where the browser plays the audio of a memory from: our own route, never Cloudinary. The route checks the session,
 * reads the memory as the visitor (row-level security), and streams the signed Cloudinary audio back with byte ranges,
 * so the signed URL never reaches the browser. Safe to import anywhere (no server code).
 */
export const memoryAudioPath = (memoryId: string): string => `/api/memories/${encodeURIComponent(memoryId)}/audio`
