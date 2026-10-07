# Projects grid

- **Locator:** `odd/tasks/projects-grid.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/projects-grid/tasks` (project `theduck`)
- **Branch:** `feat/projects-grid` from `main` @ `58444bf`
- **Follows:** `odd/tasks/work-path.md` (T1–T5, delivered)

## Objective

Make Proyectos feel as composed as Recuerdos:
- the choice prompt becomes "¿qué te trae por acá?";
- the Proyectos title gets the same arrival transition as "Recuerdos";
- the list and the case study sit on a 6-column grid with faint guides;
- the list row shows the full Voltaicco logo;
- on desktop the case study puts the stack in a left column of items, and clicking an item reveals the technology's official isotype;
- the case study reads as one continuous text with no pagination;
- the case study is rewritten as an IoT project, a UPS monitor for electro-dependent people, describing the technology and the architecture.

## User request (2026-10-07, verbatim, with two desktop screenshots)

"En vez de que vienes, pone "Que te trae por acá??"

[Image #2]
Acpa pone el SVG Completo.
Y fijate que los recuerdos como que transiciona la palabra "Recuerdos"
Hace lo mismo con proyectos y mostralo de otra forma, más armoniosa en cuando a "Ejes/rEFERENCIAS" que tenga la interfaz, como si estuviera la pantalla dividida en 6. Guias. Así da una sensacion de armonia.

En desktop.
[Image #3]
Las tecnologias y dependencias, separalas a la izquierda y ponelos como items que cuando los clickeas, se abren los isotipos de las tecnologias. Busca los vectores oficiales de cada isotipo"

**Screenshots.**
- Image #2: the Proyectos list. The meta reads "DISEÑO Y DESARROLLO, 2026" on the left, then the mark, then "Voltaicco". A huge pixel "Proyectos" sits at the bottom. The annotations show a left axis, and an arrow sends the row to the right.
- Image #3: the case study on desktop. The logo and the stack run inline under it. The text is paged, and a second page overlaps the first. Lines drawn in the left column ask for the stack as a vertical list. The prev/next arrows and "2 de 4" are circled and crossed out.

**Interpretation the user confirmed** (2026-10-07). It was shown as a mockup; the user replied: "Si, más que consola, le pondría. Monitor de UPS para electrodependientes. Proyecto IoT Open Platform o algo así, describi la tecnología, arquitectura, etc etc."
- **List (6 columns):** column 1 holds the meta, columns 2–3 the full logo, columns 4–6 the summary. The small "Proyectos" sits under "‹ Universo" after the transition.
- **Case study:** columns 1–2 are sticky and hold back, logo, meta and the stack items that expand to show isotypes. Columns 3–6 hold the continuous text. There are no arrows and no "2 de 4".
- **Copy:** "Monitor de UPS para electrodependientes", an IoT project on EcoFlow's IoT open platform.

## Decisions

- **The prompt.** `CHOICE_PHRASE` becomes "¿qué te trae por acá?". It stays lowercase, like every other phrase in that title font.
- **Proyectos title.** Reuse the "Recuerdos" title motion (`src/features/memories/ui/title-motion.ts`, `use-title.ts`): a large title on arrival, then a FLIP into the small label under the back control after the hold, and a crossfade under reduced motion. If it has to move, extract it to a shared place instead of copying it.
- **Grid.**
  - Desktop has 6 equal columns inside the existing safe insets, with faint vertical guides (hairlines at very low opacity, decorative, `aria-hidden`).
  - Mobile stacks to a single column, keeps the same left axis and hides the guides.
- **List row.** The full logo SVG, the meta, and the summary "Monitor de UPS para electrodependientes". The whole row is one link or button. A project with no logo falls back to its title text.
- **Case study for projects.**
  - **Desktop:** columns 1–2 are sticky (back, logo, meta, then a "Stack" list of items). Each item is a disclosure button with `aria-expanded`; opening it reveals the official isotype and the name. Columns 3–6 hold the whole body, scrolling, with `##` subheadings and no pagination.
  - **Mobile:** single column. The stack list comes after the text or is collapsible.
  - The placeholder facets (Historias, Escritos, Ahora) keep today's paged Reader.
- **Official isotypes.**
  - **Source:** each brand's official asset, with a recorded source URL. Simple Icons is a fallback only where no official SVG exists, and that is recorded too.
  - **Location:** `public/tech/<key>.svg`, plus a sources manifest.
  - **Safety:** the same SVG guard as the logos (no script, foreignObject, `on*` or `javascript:`).
  - A typed registry maps each stack name to its icon key.
- **Content.**
  - **Summary:** "Monitor de UPS para electrodependientes".
  - **Meta:** "Proyecto IoT", using the official name of EcoFlow's open platform once it is verified.
  - **Body:** first person, describing the problem, technology, architecture, the IoT integration, safety and quality.
  - **Privacy:** no client or company name, no domains, no serial numbers, no emails, no telemetry, no links.
- **Delivery.** The same as before: work-unit commits on this branch, then a fast-forward of `main` and a push after the user's approval. RDD runs per commit from the last reviewed boundary, starting at `58444bf`.

## Forecast

About 1,100 authored changed lines: T1 ~40, T2 ~150, T3 ~350, T4 ~450, T5 ~150 (assets excluded).

## Tasks

- [x] **T1 — Prompt copy.** Done in `2d1f08f`. `CHOICE_PHRASE` becomes "¿qué te trae por acá?", with its tests. Route: delegated, together with T2 (writer A).
- [x] **T2 — Case study rewrite.** Done in `3b7f9e5`. IoT, electro-dependent users, technology and architecture, with the new summary and meta. Route: delegated (writer A, which reads the ecoflow docs).
- [x] **T3 — Proyectos list on the 6-column grid.** Done in `1f4c783`. Title transition, guides, the full logo row and the summary. Route: delegated (writer B).
- [x] **T4 — Case-study layout.** Done in `5b88756`. Sticky left column, the stack disclosure list, continuous text and no pagination. Projects only. Route: delegated (writer C).
- [x] **T5 — Official tech isotypes.** Done in `cc94515`. Research the official SVGs (a read-only worker that downloads into the scratchpad), then add the assets, the manifest, the registry and the guard. Route: research is delegated in parallel; the integration goes with writer C.

## Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build` at closure.
- A visual check on desktop and on a phone.

## Progress

- 2026-10-07: interpretation confirmed by the user. Branch created. Next: writer A (T1 and T2), with the isotype research in parallel.
- 2026-10-07, **T1 done** in `2d1f08f` (`feat(onboarding): ask what brings the visitor here`).
  - Change: `CHOICE_PHRASE` is now "¿qué te trae por acá?".
  - Test evidence: RED was `expected '¿qué vienes a ver?' to be '¿qué te trae por acá?'` (3 failed); GREEN followed.
  - Length: `letterTimeline` shrinks the letter step to fit the 1300 ms cap, so the longer phrase still fits.
- 2026-10-07, **T2 done** in `3b7f9e5` (`docs(content): rewrite the Voltaicco case study as an IoT UPS monitor`).
  - Summary: "Monitor de UPS para electrodependientes."
  - Role: "Proyecto IoT · diseño y desarrollo".
  - Sections: El problema, La integración IoT, Arquitectura, Apagar a distancia, Acceso y roles, Calidad, accesibilidad y costo, Dónde está hoy. Length is about 645 words.
  - Platform name: the ecoflow docs never give the official name. `docs/ecoflow-api.md:128` shows "Open Platform" only as a table label, so the text says "la plataforma abierta IoT de EcoFlow".
  - Removed claim: "~1,400 tests / 94%", because the allowed docs can't confirm it.
  - Privacy self-check: clean.
- **Checks for T1 and T2:**
  - `typecheck` and `lint`: exit 0.
  - `pnpm vitest run src/features/projects`: 32 of 32 passed.
  - Full `pnpm test` on this branch (parent runs, machine idle except for the user's IDE and MCP servers): one run had 2 failures, the next had 1. Each failure was "Test timed out in 5000ms", in `src/features/orb/orb-path.test.ts:92` or `src/shared/db/migrations.pglite.test.ts:82`. Both files pass when run alone (26/26).
  - The same full run on `main` @ `58444bf` passed 3,486 of 3,486.
  - **Classification:** a timing flake at the 5 s edge. The diff only touches `phrases.ts`, two onboarding tests and the case-study Markdown, and none of these can reach either suite. This is recorded as a known environmental failure.
- **RDD:** medium, `review_due: false`, under budget (151 lines since `58444bf`).
- 2026-10-07, **T5 research done.** 12 SVGs are in the scratchpad `tech-icons/`, with a `SOURCES.md` listing them.
  - 10 are official: Next.js and Vercel from the Vercel press kit, plus React, TypeScript, Tailwind, Prisma (`prisma.io/icon.svg`, transparent), Neon, Better Auth, Zod and Vitest.
  - 2 are Simple Icons fallbacks, because neither project publishes an official SVG: Testing Library (#E33332) and GitHub Actions (#2088FF).
  - Zod's official SVG embeds two base64 PNGs and weighs 45 KB.
  - No file contains script, foreignObject, `on*` or `javascript:`.
- Next: writer B (T3).
- 2026-10-07, **T3 blocked on edit surfaces.** `mobile-layout.test.tsx` pins classes from the old FacetPlace layout. Removing `listSide` leaves `listSideFor` dead, along with its test.
  - The user approved adding `src/features/journey/mobile-layout.test.tsx`, `journey-machine.ts` and `journey-machine.test.ts`.
  - **Grid clarification from the user:** "no es necesario que el texto se muestre en 6 columnas, pero si, que sirva como referencia como guias de como posicionar, por ahi, vas a usar dos columnas para el side izq y el resto para el texto". The 6 columns are a positioning reference, shown as faint guides with edges that elements snap to. There is one split, shared by the list and the case study: a **left zone of columns 1–2** and a **content zone of columns 3–6**.
  - **Title font:** Doto in both states, so the FLIP scales the same glyphs. The small label copies the placement, size and opacity of "Recuerdos".
- 2026-10-07, **T3 done** in `1f4c783` (`feat(facets): lay the Proyectos list on a 6-column grid with the title transition`). Route: delegated. 22 files, +640/−279. About 190 of those lines are the memories title code moving to a shared module.
  - **Shared code:**
    - **`@/shared/ui/place-title`:** `usePlaceTitle(ref, { reduced, settled? })`, `TITLE_LABEL`, the timing constants, `reduceTitle` and `flipTransform`. The CSS class `.mem-title` is now `.place-title`. Memories re-exports the constants for its test.
    - **`@/shared/ui/grid`:**
      - `GRID`: `md:grid-cols-6`.
      - `GRID_X`: the left and right insets.
      - `GRID_ASIDE`: columns 1–2.
      - `GRID_CONTENT`: columns 3–6.
      - `<GridGuides>`: 7 hairlines, `aria-hidden`, hidden on mobile.
      - Tokens `--grid-left`, `--grid-right` and `--grid-gap`. The column-1 axis is the same as the back chevron's axis.
  - **List row:** meta on guide 1, the full logo on guide 3, the summary on guide 5. The accessible name is the title plus the summary, and the meta is the description. Without a logo, the row falls back to the title and the mark.
  - **Title:** every facet place gets the "Recuerdos" FLIP. In Doto, the small label sits at x 51 / y 76, on the column-1 axis.
  - **Removed:** `listSide` and `listSideFor`.
  - **Mobile:** stacked on one axis with no guides. Short landscape puts the list at 112px.
  - **Checks:**
    - `pnpm test`: 3,505 of 3,505 passed.
      - An earlier run failed `memories-place.test.tsx:554`. The writer reproduced that test's failure on the base memories code (2 failures in 30 runs), so it is an existing flake that T3 did not cause.
    - `typecheck`, `lint` and `build`: exit 0.
    - Parent spot check: facets, shared UI and mobile layout passed 78 of 78.
  - **Visual check by the writer** (headless Edge over CDP, at 1280, 1440 and 1920 wide, plus 390, 360 and 844×390): alignment measured exactly on the guides, and there is no horizontal overflow.
- 2026-10-07, **RDD for T1–T3.** Assessed medium (`slice_budget_reached`, 1,118 lines). Consent granted, one lens (reliability).
  - Lineage `review-9d9c8ebd6c3ef385` over `58444bf..9380904`: **approved and acknowledged**, authority burned. The reviewed boundary is now `9380904`.
  - Advisory `R3-001` (suggestion): the `facet-place.test.tsx` FLIP tests stub `HTMLElement.prototype.animate` and remove it only at the end of each test, so a failing assertion leaks the stub into later tests. Folded into T4.
- 2026-10-07, **T5 done** in `cc94515` (`feat(projects): add official technology isotypes with their sources`). Writer C. 17 files, +449/−1.
  - **Files:** 12 SVGs in `public/tech/`.
    - 10 are byte-identical to the official downloads.
    - Only the two Simple Icons fallbacks got a root `fill` (testing-library #E33332, github-actions #2088FF).
  - **Registry:** `src/features/projects/tech.ts` holds `{ key, name, icon, source, documentedAt, official }` for each technology, plus an explicit `techFor()` mapping.
  - **Guard:** `svg-guard.ts` is shared by the logos and the tech icons. It rejects script, foreignObject, `on*`, `javascript:` and any href that is not a `#fragment` or a `data:image/(png|jpeg|webp)` URI.
  - **Checks:** test 3,566 passing; typecheck and lint exit 0.
- 2026-10-07, **T4 done** in `5b88756` (`feat(reader): case-study layout with the stack aside and continuous text`). 12 files, +562/−44.
  - **New component:** `src/features/reader/case-study.tsx`, used when `facet.id === "projects"`. The placeholder facets keep the paged Reader.
  - **Desktop:** the aside is sticky in columns 1–2: back, logo, meta, then "Stack" with disclosure items (`aria-expanded`/`aria-controls`, a 40px isotype, reduced motion respected). Columns 3–6 hold the continuous text. `---` is now a hairline between sections, and the subheadings use the 12px label style. There is no pagination.
  - **Phone:** a single column, with the stack after the text. Rendered twice (the aside copy plus a phone copy) with one shared open state, so focus order follows visual order.
  - **Data:** `FacetEntry.details` is replaced by `stack: {name, icon?}[]`.
  - **R3-001:** the stub cleanup moved to `afterEach`, proven by an `it.fails` canary.
  - **Checks:** `pnpm test` 3,590 passing plus 1 expected fail; typecheck, lint and build exit 0. Parent spot check: typecheck exit 0.
  - **Visual check** (writer screenshots in scratchpad `shots/`; the parent looked at the d1440 and m390 shots):
    - At 1440, the aside sits on guide 1 at x 51 and the text on guide 3 at x 500. Isotypes open at 40×40.
    - At 390 and 360 there is no overflow.
    - **Parent observation:** on a phone the text scrolls underneath the fixed "‹ Proyectos" control with no fade, so a line shows behind it.
  - **Follow-ups:**
    - `reader.tsx`'s `details`, `logo` and `pages` props are now unused by projects (clean up later).
    - With a classic scrollbar, the case-study guides are slightly narrower than the list's guides.
- 2026-10-07, **RDD for T4 and T5.**
  - **Assessment:** high, because of a `hot_path` "auth" signal from the file name `public/tech/better-auth.svg`. The file is a logo, not auth code.
  - **Lenses:** consent granted, four lenses (risk, resilience, readability, reliability), run concurrently.
  - **Result:** lineage `review-5d44f274afd4bcb8` over `9380904..1cd4336` was **approved and acknowledged**; its authority is burned. The reviewed boundary is now `1cd4336`.
  - **Correction to the T4 note above:** the candidate already includes a gradient fade and a `z-10` lift under the fixed back control (R2-004). The phone screenshot still shows a line of text through the fade, so the strength of the fade needs the user's visual check.
  - **Advisory findings (all suggestions, follow-ups):**
    - `R4-001`: every isotype is fetched up front even while collapsed, including Zod at 45 KB.
    - `R2-001`: `CaseStudyTech` duplicates `FacetEntryTech`.
    - `R2-002`: the `.tech-reveal` CSS timings copy the place-title constants, and only a regex test ties them together.
    - `R2-003`: Reader's `details` prop and the `ReaderDetail` type are dead.
    - `R3-001`: `svgHazards` does not check CSS `url()` or entity-encoded `javascript:` in non-href attributes. None of the shipped files has either.
    - `R3-002`: the R3-001 canary depends on test order.
- 2026-10-07, **All tasks done.** Next: the user's visual check, then their approval to fast-forward `main` and push.
