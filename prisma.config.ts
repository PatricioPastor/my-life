import path from "node:path"
import dotenv from "dotenv"
import { defineConfig } from "prisma/config"

// The CLI reads .env.local (Next.js convention). Vercel and CI have no such file and
// inject variables directly, so a missing file is fine.
dotenv.config({ path: path.join(__dirname, ".env.local"), quiet: true })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // DIRECT_URL is the owner role's unpooled URL and is only needed by commands that
    // connect (migrate deploy/dev). Not using `env()` keeps `prisma generate` and
    // `pnpm build` working when it is missing: it never connects.
    url: process.env.DIRECT_URL ?? "",
  },
})
