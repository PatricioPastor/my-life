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

- [ ] **T1 — Prisma ORM isotype, plus a check of all 12 isotypes.** Research runs as a parallel worker; the change is done by writer E.
- [ ] **T2 — Stack grouped by category.** Frontmatter, parser, registry and a `CaseStudy` UI with chips that load lazily. Writer D.
- [ ] **T3 — Hide the guides.** Writer D.
- [ ] **T4 — Section index with scroll-spy.** Writer E.
- [ ] **T5 — Headline that shrinks on scroll.** Writer E.
- [ ] **T6 — Switzer for the narrative.** Research runs as a parallel worker; the change is done by writer E.

## Checks

- `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm build` at closure
- Headless-browser screenshots at 1440×900 and 390×844

**Known environmental flakes:**
- 5 s timeouts in `orb-path.test.ts:92` and `migrations.pglite.test.ts:82`.
- `memories-place.test.tsx:554` fails about once in 15 runs on the base as well.

## Progress

- 2026-10-07: the interpretation was confirmed and the branch created. Next: the research worker (Switzer, the Prisma ORM symbol) runs in parallel with writer D (T3, T2).
