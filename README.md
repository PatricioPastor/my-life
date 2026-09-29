# my-life

A personal landing, by invitation only. Visitors enter with their Instagram handle, which is checked against a server-side whitelist, and then land in a halftone WebGL sky whose stars open the facets (stories, writing, projects, now).

Stack: Next.js (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Vitest, pnpm.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Vitest in watch mode |

## Structure

The layout screams what the app does, not which framework it uses.

```
src/
  app/                 routes only, kept thin (compose features, no logic)
  features/<domain>/   domain code: sky, gate, journey, facets, reader
  shared/
    ui/                shadcn primitives (generated) and other dumb UI
    lib/               cross-cutting helpers (cn, color, ...)
    hooks/             cross-cutting hooks
```

Each feature exposes its public API through an `index.ts` barrel; other code imports from the barrel, never from a feature's internals.

shadcn is configured in `components.json` so its aliases point under `@/shared` (`ui` is `@/shared/ui`, `utils` is `@/shared/lib/utils`). Generated primitives land in `src/shared/ui`, which keeps vendor-style code separate from domain code. That separation lets you re-run `pnpm dlx shadcn@latest add <component>` or update primitives without touching any feature.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env*` files are git-ignored except `.env.example`.

| Variable | Purpose |
| --- | --- |
| `INSTAGRAM_WHITELIST` | Comma-separated handles allowed in. Read on the server only; it never ships to the client. |

The gate is a velvet rope, not security: it does not prove that a handle belongs to the visitor.
