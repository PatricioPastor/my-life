# Case study polish

- **Locator:** `odd/tasks/case-study-polish.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/case-study-polish/tasks` (project `theduck`)
- **Branch:** `feat/case-study-polish` from `main` @ `c29015e`
- **Follows:** `odd/tasks/projects-grid.md` (delivered)

## Objective

Polish the project case study:
- Group the stack by category. Each category opens to show its technologies as chips, each with its isotype.
- Hide the grid guides. They stay only as invisible layout references.
- Add an index of sections on the right that marks where the reader is.
- Put a headline at the top that shrinks while scrolling.
- Set the project narrative in Switzer.
- Replace the wrong Prisma isotype with the Prisma ORM one.

## User request (2026-10-07, verbatim, with two desktop screenshots)

"Mira, el stack me lo imaginaba asi.

Stack
Backend
Testing
[Vitest]
Dependencias
[Better Auth] [Zod 4]

Si est[a colapsado, se muestra as[i, pero si no esta colapsado, muestra el conjunto.

Despues, las guias, no quiero que se vean, eran referenciales.

[Image #5]
Ah[i, podr[ia haber un indice de cada topico.
Y quiero que tenga como un titulo y que cuando scrollee, tambien se achique un poco, para que se aprecie mejor la pagina.
Por otro lado, tambien,la fuente

https://www.fontshare.com/fonts/switzer
La fuente que quiero usar para el narrado de los proyectos, es esa."

**Screenshots:**
- **Image #4 (desktop case study):** the flat 12-item stack list in the aside, the visible guides, and a "VER ISOTIPO" hover hint.
- **Image #5 (the content column):** yellow lines drawn in the empty right-hand area, where the index should go.

**Interpretation the user confirmed** (2026-10-07, shown as a mockup): the user chose "El resumen como titular". Their note: "Y el logo de prisma, pusiste el medio de pago, pero es prisma el ORM."

## Decisions

- **Stack by category.** Categories are disclosures.
  - Collapsed, a category shows only its label.
  - Expanded, it shows its technologies as chips, each an isotype plus a name.
  - All categories start collapsed.
  - Isotype images mount only when their category is open. This resolves `R4-001` (every icon fetched up front).
  - The grouping lives in frontmatter and keeps its order. The default grouping is:
    - Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
    - Backend: Prisma 7, Neon Postgres
    - Dependencias: Better Auth, Zod 4
    - Testing: Vitest, Testing Library
    - Infraestructura: GitHub Actions, Vercel
- **Guides.** `GridGuides` is no longer rendered. The grid tokens and zones stay.
- **Index.**
  - The text moves to columns 3–5, and a sticky index sits in column 6 listing every `##` section.
  - Clicking an entry jumps to its section, smoothly except under reduced motion.
  - A scroll-spy marks the current section with `aria-current`.
  - The index is hidden on phones.
- **Headline.** The `summary` ("Monitor de UPS para electrodependientes") sits at the top of the content, large and set in Switzer. On scroll it shrinks to a compact sticky line next to the mark. Under reduced motion the change is instant. The compact bar also gives the back control a proper backdrop on phones.
- **Font.** Switzer comes from Fontshare's official download and is self-hosted with `next/font/local`, using the variable font in roman and italic. It is free under the ITF Free Font License. It applies to the case-study narrative: the headline, the body and the index. The other stories keep their current serif.
- **Prisma.** Replace the current file with the official Prisma ORM symbol from `github.com/prisma/presskit`, in the light variant for dark backgrounds. The current file's cyan, red and yellow colors look like the payment network's logo. Render a contact sheet of all 12 isotypes and check each brand by eye.
- **Delivery.** The same as before: work-unit commits on this branch, then fast-forward `main` and push after the user approves. RDD runs per commit from `c29015e`.

## Forecast

About 900 authored changed lines: T1 ~60, T2 ~300, T3 ~30, T4 ~250, T5 ~200, T6 ~80 (font files excluded).

## Tasks

- [ ] **T1 — Contact sheet of the 12 isotypes, checked by eye.** Prisma stays as the 2026 mark at the user's request, so no swap is needed. Writer E.
- [x] **T2 — Stack grouped by category.** Done in `b3a34dd`. Frontmatter, parser, registry and a `CaseStudy` UI with chips that load lazily. Writer D.
- [x] **T3 — Hide the guides.** Done in `5fca1c1`. Writer D.
- [ ] **T4 — Section index with scroll-spy.** Writer E.
- [ ] **T5 — Headline that shrinks on scroll.** Writer E.
- [ ] **T6 — Switzer for the narrative, loaded through the Fontshare CSS API on `/trabajo` only.** No font files go in the repo. Writer E.

## Checks

- `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm build` at closure
- Headless-browser screenshots at 1440×900 and 390×844

**Known environmental flakes:**
- 5 s timeouts in `orb-path.test.ts:92` and `migrations.pglite.test.ts:82`.
- `memories-place.test.tsx:554` fails about once in 15 runs on the base as well.

## Progress

- 2026-10-07: the interpretation was confirmed and the branch created. Next: the research worker (Switzer, the Prisma ORM symbol) runs in parallel with writer D (T3, T2).
- 2026-10-07, **Research done.**
  - **Prisma.**
    - The cyan, red and yellow mark from `prisma.io/icon.svg` is **Prisma ORM's own current mark**, introduced in the 2026 rebrand. Evidence: `prisma/presskit` commit `4cfdd24942` (2026-08-18), "Update brandkit with the new Prisma logo and assets". It removed the "old indigo-era" files, and `prisma.io/orm` uses this mark as its favicon.
    - The classic white triangle (`Prisma-LightSymbol.svg` at `13ee1c557d`) is retired.
    - **User decision:** "Logo actual 2026", so `public/tech/prisma.svg` stays as it is. T1 shrinks to a contact sheet of all 12 isotypes, checked by eye.
  - **Switzer.**
    - Fontshare's official zip ships `Switzer-Variable.woff2` (43,220 B) and `Switzer-VariableItalic.woff2` (33,408 B), with a `wght` axis from 100 to 900.
    - The license is the ITF Free Font License v2.0. Self-hosting on your own site is allowed (§ line 36). Subsetting or converting the files is forbidden. Distribution through any "repository" or "publicly accessible servers" is forbidden (line 53).
    - my-life is a **public** GitHub repo, so committing the `.woff2` files would conflict with that clause.
    - **User decision:** "API de Fontshare". Load Switzer through Fontshare's CSS API (`api.fontshare.com`), only on the `/trabajo` routes. No font files are committed. The cost is one third-party request and a small font swap.
- 2026-10-07, **T3 done** in `5fca1c1` (`refactor(ui): drop the visible grid guides`). Writer D. 9 files, +32/−81.
  - `GridGuides` was removed: the component, its export and its tests. The grid tokens and zones stay.
  - RED: both screens rendered the guides layer.
  - Checks: `pnpm test` 3,587 passing plus 1 expected fail; typecheck and lint clean.
- 2026-10-07, **T2 done** in `b3a34dd` (`feat(reader): group the case-study stack by category with lazy isotypes`). 16 files, +327/−138.
  - **Frontmatter.** `stack` is now an ordered YAML map from category to list.
    - Verified with `yaml@2.9.1`: insertion order is kept, except for integer-like keys, so a category named only by a number is rejected.
    - The parser also rejects empty or nameless categories, a technology repeated within or across categories, and a category listed twice (YAML's own error).
  - **Shared types.** `StackItem` and `StackGroup<Item>` live in `projects/tech.ts`, which resolves R2-001.
  - **UI.** Each category is a disclosure. Collapsed shows the label only; open shows chips (a 20px isotype plus the name, 32px high) in a wrapping row. Everything starts collapsed, and several categories can be open at once.
  - **Lazy images.** An `<img>` is not mounted until its category opens, and it stays mounted afterwards so the close can animate. This resolves R4-001; verified that no `/tech/` request happens before a category opens.
  - **RED.** Before the change, the parser failed 20 tests, the facets mapping 3 and `CaseStudy` 11.
  - **Checks.** `pnpm test` 3,601 passing plus 1 expected fail; typecheck, lint and build clean.
  - **Visual.** Shots in scratchpad `shots-polish/`. The parent viewed the 1440 open shot: Dependencias and Testing open with their chips, and no guides.
  - **Parent spot check.** reader, projects and shared/ui: 158 of 158 passed.
