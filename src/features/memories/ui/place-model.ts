/** The place section's Spanish copy (neutral, `tú`). It always speaks about where the PHOTO was taken. */
export const PLACE_COPY = {
  heading: "¿Dónde se sacó?",
  idle: "Elige una foto para sugerirte dónde se sacó.",
  reading: "Buscando la ubicación de la foto…",
  naming: "Buscando el lugar…",
  noGps: "Esta foto no trae ubicación.",
  mapLink: "Ver en el mapa",
  consent: "Guardar dónde se sacó la foto",
  help: "Solo guardamos una ubicación aproximada (unos 1 km), nunca la exacta.",
  notSaved: "No pudimos guardar el lugar.",
  linkLabelFound: "¿No fue ahí? Pega un link de Google Maps",
  linkLabelNone: "Si quieres, pega un link de Google Maps",
  linkPlaceholder: "https://maps.app.goo.gl/…",
  linkReading: "Leyendo el link…",
  linkNotMaps: "Ese link no parece de Google Maps.",
  linkUnreadable: "No pudimos leer la ubicación de ese link.",
  linkBlocked: "Revisa el link de Google Maps o bórralo para seguir.",
} as const

export const suggestionLabel = (place: string) => `Parece que fue en ${place}`

/** The place a pasted link points at; it replaces the suggestion from the photo. */
export const linkPlaceLabel = (place: string) => `Según el link: ${place}`

/** A rounded position shown when there is no place name: "Cerca de -34.59, -58.42". */
export const coordinatesLabel = (lat: number, lng: number) => `Cerca de ${lat.toFixed(2)}, ${lng.toFixed(2)}`

/** Where the visitor can check a rounded position on the map. Opens in a new tab. */
export const googleMapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
