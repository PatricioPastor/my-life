/**
 * The place section's Spanish copy (neutral, `tú`). Its suggestions always speak about where the PHOTO was taken (never
 * where the visitor is); the heading asks where the memory happened, which the photo's place answers.
 */
export const PLACE_COPY = {
  heading: "¿Dónde fue?",
  idle: "Con una foto te sugerimos el lugar.",
  reading: "Buscando la ubicación de la foto…",
  naming: "Buscando el lugar…",
  awaitingConsent: "Esta foto trae ubicación. Marca la casilla para sugerirte el lugar.",
  noGps: "Esta foto no trae ubicación.",
  mapLink: "Ver en el mapa",
  consent: "Guardar el lugar exacto y su dirección. Lo verán las personas que pueden entrar.",
  /** What the place is for, shown only while there is one (the photo's or a pasted link's); the consent says what is kept. */
  help: "El lugar sirve para ubicar tu recuerdo en el universo.",
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

/** A position shown with 2 decimals when there is no place name: "Cerca de -34.59, -58.42". */
export const coordinatesLabel = (lat: number, lng: number) => `Cerca de ${lat.toFixed(2)}, ${lng.toFixed(2)}`

/** Where the visitor can check a position on the map. Opens in a new tab. */
export const googleMapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
