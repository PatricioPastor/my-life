/** Where the public work galaxy lives. Plain strings, so the onboarding can link here without loading the galaxy. */
export const WORK_PATH = "/trabajo"

/** The deep link to one case study. */
export function workProjectPath(slug: string): string {
  return `${WORK_PATH}/${slug}`
}
