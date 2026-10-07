/** A technology a case study lists, by the file name of its mark in public/tech. */
export type TechKey =
  | "nextjs"
  | "react"
  | "typescript"
  | "tailwindcss"
  | "prisma"
  | "neon"
  | "better-auth"
  | "zod"
  | "vitest"
  | "testing-library"
  | "github-actions"
  | "vercel"

/** A technology and its isotype: the brand's own mark, with where it came from. */
export interface Tech {
  key: TechKey
  /** The brand's name, as the brand writes it. */
  name: string
  /** The mark, a site path to its SVG in public/tech. */
  icon: `/tech/${TechKey}.svg`
  /** The file it was downloaded from; for a mark inside a press kit archive, the archive with the path in its fragment. */
  source: string
  /** Where the brand publishes or documents that mark (its brand page, press kit or repository). */
  documentedAt: string
  /** False for a stand-in from Simple Icons, used only where the brand publishes no SVG of its own. */
  official: boolean
}

// Vercel's press kit ships Next.js and Vercel marks only inside these archives.
const VERCEL_PRESS = "https://k2mkucxia43oc7fa.public.blob.vercel-storage.com/front/press"

/**
 * The marks, downloaded on 2026-10-07 and served unmodified (several brands forbid editing their marks). The two
 * stand-ins only gained a root fill in their brand color, since Simple Icons paths ship without one.
 */
export const TECH: readonly Tech[] = [
  {
    key: "nextjs",
    name: "Next.js",
    icon: "/tech/nextjs.svg",
    source: `${VERCEL_PRESS}/nextjs-assets.zip#NEXTJS/icon/dark-background/nextjs-icon-dark-background.svg`,
    documentedAt: "https://vercel.com/geist/brands",
    official: true,
  },
  {
    key: "react",
    name: "React",
    icon: "/tech/react.svg",
    source: "https://react.dev/images/brand/logo_dark.svg",
    documentedAt: "https://github.com/reactjs/react.dev/blob/main/src/components/Layout/TopNav/BrandMenu.tsx",
    official: true,
  },
  {
    key: "typescript",
    name: "TypeScript",
    icon: "/tech/typescript.svg",
    source: "https://www.typescriptlang.org/branding/ts-logo-512.svg",
    documentedAt: "https://www.typescriptlang.org/branding/",
    official: true,
  },
  {
    key: "tailwindcss",
    name: "Tailwind CSS",
    icon: "/tech/tailwindcss.svg",
    // A hashed build path on the brand page, which may move with the next deploy of tailwindcss.com.
    source: "https://tailwindcss.com/_next/static/media/tailwindcss-mark.0~s.iziag2xd..svg",
    documentedAt: "https://tailwindcss.com/brand",
    official: true,
  },
  {
    key: "prisma",
    name: "Prisma",
    icon: "/tech/prisma.svg",
    // The press kit's logo-mark.svg draws the same paths over an opaque white square; this one is transparent.
    source: "https://www.prisma.io/icon.svg",
    documentedAt: "https://github.com/prisma/presskit",
    official: true,
  },
  {
    key: "neon",
    name: "Neon",
    icon: "/tech/neon.svg",
    source: "https://neon.com/brand/neon-logomark-dark-color.svg",
    documentedAt: "https://neon.com/brand",
    official: true,
  },
  {
    key: "better-auth",
    name: "Better Auth",
    icon: "/tech/better-auth.svg",
    source: "https://better-auth.com/branding/svg/better-auth-mark-light.svg",
    documentedAt: "https://better-auth.com/brand",
    official: true,
  },
  {
    key: "zod",
    name: "Zod",
    icon: "/tech/zod.svg",
    // Shaded with two embedded PNGs, which makes it the heaviest mark (about 45 KB).
    source: "https://zod.dev/logo/logo.svg",
    documentedAt: "https://github.com/colinhacks/zod",
    official: true,
  },
  {
    key: "vitest",
    name: "Vitest",
    icon: "/tech/vitest.svg",
    source: "https://vitest.dev/logo.svg",
    documentedAt: "https://github.com/vitest-dev/vitest/blob/main/docs/.vitepress/config.ts",
    official: true,
  },
  {
    key: "testing-library",
    name: "Testing Library",
    icon: "/tech/testing-library.svg",
    // The official octopus exists only as PNG.
    source: "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/testinglibrary.svg",
    documentedAt: "https://simpleicons.org/?q=testing+library",
    official: false,
  },
  {
    key: "github-actions",
    name: "GitHub Actions",
    icon: "/tech/github-actions.svg",
    // GitHub's brand kit has no Actions mark.
    source: "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/githubactions.svg",
    documentedAt: "https://simpleicons.org/?q=github+actions",
    official: false,
  },
  {
    key: "vercel",
    name: "Vercel",
    icon: "/tech/vercel.svg",
    source: `${VERCEL_PRESS}/vercel-assets.zip#Vercel/icon/dark/vercel-icon-dark.svg`,
    documentedAt: "https://vercel.com/geist/brands",
    official: true,
  },
]

/** The case studies' own spellings (content/projects/*.md, `stack`), versions and products included. */
const SPELLINGS: Readonly<Record<string, TechKey>> = {
  "Next.js 16": "nextjs",
  "React 19": "react",
  "Tailwind CSS 4": "tailwindcss",
  "Prisma 7": "prisma",
  "Neon Postgres": "neon",
  "Zod 4": "zod",
}

const BY_NAME: ReadonlyMap<string, Tech> = new Map([
  ...TECH.map((tech) => [tech.name, tech] as const),
  ...Object.entries(SPELLINGS).map(([name, key]) => [name, TECH.find((tech) => tech.key === key)!] as const),
])

/**
 * The technology a stack name stands for: the brand's own name or a spelling listed above, exactly as written. Anything
 * else, however close, has none (no guessing), and is shown as its name alone.
 */
export function techFor(name: string): Tech | undefined {
  return BY_NAME.get(name)
}

/** One technology of a case study's stack: its name as written, and its isotype when the registry knows that name. */
export interface StackItem {
  name: string
  /** A site path to the technology's mark (public/tech). A name the registry does not know has none. */
  icon?: string
}

/**
 * One category of a case study's stack (e.g. "Backend") and its technologies, both in the order the case study writes
 * them. As parsed, an item is a name; as shown, a {@link StackItem}.
 */
export interface StackGroup<Item = StackItem> {
  name: string
  items: readonly Item[]
}
