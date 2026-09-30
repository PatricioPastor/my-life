// Public site config, not a secret: the Instagram DM is the disclosure channel.
const CONTACT = "https://ig.me/m/patriciopastor_"
const VALID_DAYS = 364
const DAY_MS = 24 * 60 * 60 * 1000

interface SecurityTxtInput {
  siteUrl: string
  now: Date
}

/** RFC 9116 body. `Expires` must stay under a year, so it is derived from `now`. */
export function buildSecurityTxt({ siteUrl, now }: SecurityTxtInput): string {
  const expires = new Date(now.getTime() + VALID_DAYS * DAY_MS).toISOString()
  return [
    `Contact: ${CONTACT}`,
    `Expires: ${expires}`,
    "Preferred-Languages: es, en",
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    "",
  ].join("\n")
}
