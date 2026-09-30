export const GRAIN_W = 160
export const GRAIN_H = 90
export const GRAIN_FPS = 12

/** Writes opaque grey noise into an RGBA pixel buffer (one uint32 per pixel). */
export function fillGrain(buffer: Uint32Array, rand: () => number = Math.random): void {
  for (let i = 0; i < buffer.length; i++) {
    const v = (rand() * 256) | 0
    buffer[i] = 0xff000000 | (v << 16) | (v << 8) | v
  }
}
