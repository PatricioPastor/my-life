// The package only types its root entry. The browser uses the "lite" build (JPEG and HEIC, about 12 kB gzipped),
// loaded lazily, and only its GPS reader.
declare module "exifr/dist/lite.esm.mjs" {
  export function gps(data: Blob): Promise<{ latitude: number; longitude: number } | undefined>
}
