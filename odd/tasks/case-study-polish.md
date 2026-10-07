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
- **Font** (revised 2026-10-07 by the user's choice "API de Fontshare").
  - Switzer loads through Fontshare's CSS API, only where a case study renders.
  - No font files go in the public repo, because the ITF FFL v2.0 forbids redistributing them through repositories.
  - It applies to the case-study narrative: the headline, the body and the index. The other stories keep their current serif.
- **Prisma** (revised 2026-10-07 by the user's choice "Logo actual 2026").
  - The cyan, red and yellow mark is Prisma ORM's current official logo since the 2026 rebrand, and it stays.
  - Render a contact sheet of all 12 isotypes and check each brand by eye.
- **Scrollbars** (added 2026-10-07). The user said: "El scroll, se ve horrible sin estilos, hacelo con un estilo qeu sea respetable en función al tipo de diseño que estamos armando".
  - One site-wide rule: a thin, transparent track and a narrow square thumb in a low-opacity ink token, brighter on hover.
  - Use `scrollbar-width`/`scrollbar-color` first, plus `::-webkit-scrollbar` for older WebKit.
  - Respect forced colors.
- **Delivery.** The same as before: work-unit commits on this branch, then fast-forward `main` and push after the user approves. RDD runs per commit from `c29015e`.

## Forecast

About 900 authored changed lines: T1 ~60, T2 ~300, T3 ~30, T4 ~250, T5 ~200, T6 ~80 (font files excluded).

## Tasks

- [x] **T7 — Scrollbars that match the design.** Done in `40a6846`.
- [x] **T1 — Contact sheet of the 12 isotypes, checked by eye.** All 12 OK. Prisma stays as the 2026 mark at the user's request, so no swap is needed. Writer E.
- [x] **T2 — Stack grouped by category.** Done in `b3a34dd`. Frontmatter, parser, registry and a `CaseStudy` UI with chips that load lazily. Writer D.
- [x] **T3 — Hide the guides.** Done in `5fca1c1`. Writer D.
- [x] **T4 — Section index with scroll-spy.** Done in `d635607`. Writer E.
- [x] **T5 — Headline that shrinks on scroll.** Done in `91c49b9`. Writer E.
- [x] **T6 — Switzer for the narrative.** Done in `901babe`. Loaded through the Fontshare CSS API wherever a case study renders. No font files go in the repo. Writer E.

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
- 2026-10-07, **RDD for T2 and T3.**
  - Assessment: medium, `slice_budget_reached` (699 lines).
  - Consent granted. One lens ran (reliability).
  - Lineage `review-2464d81585674510` over `c29015e..e621909`: **approved and acknowledged**, with no findings. Authority is burned.
  - The reviewed boundary is now `e621909`.
  - Next: writer E (T6, T5, T4, T1).
- 2026-10-07, **T6, T5, T4 and T7 done; T1 checked.** All by writer E.
  - **T6 — `901babe`** (+77/−1): Switzer via `https://api.fontshare.com/v2/css?f[]=switzer@1,2&display=swap`.
    - Loaded with a React 19 `<link rel="stylesheet" precedence="font">` plus `ReactDOM.preconnect`, only where a case study renders.
    - A guard test (`git ls-files`) blocks any font file from being committed.
    - There is no CSP today.
  - **T5 — `91c49b9`** (+306/−34): the summary becomes the headline.
    - It is an `h2` at 36–56px, weight 500. The logo stays the only `h1`.
    - Over the first 160px of scroll it compacts into a sticky line with an opaque backdrop. With reduced motion it switches at 80px.
    - On phones a solid strip sits behind "‹ Proyectos".
  - **T4 — `d635607`** (+443/−33): `<nav aria-label="Índice">` in column 6, from xl (1280px) up; the text sits in columns 3–5.
    - Every section heading gets a stable, unique slug id.
    - Clicking an entry scrolls so the heading lands at 132px, then focuses it.
    - **Scroll-spy:** an IntersectionObserver whose rootMargin extends upward. It also caught a real bug: jumping straight down the page marked the wrong section.
    - **Marking rules:** nothing is marked during the intro, the last section is marked at the end of the page, and a clicked entry stays marked until the user scrolls.
  - **T7 — `40a6846`** (+115/−2): `::-webkit-scrollbar` rules give a 4px square thumb in `--ink-faint`, brighter on hover.
    - In Chromium 121+ the standard `scrollbar-width` and `scrollbar-color` disable the webkit rules, so they are guarded with `@supports not selector(::-webkit-scrollbar)` and apply only in Firefox.
    - Forced colors are left alone. Checked in a headed Edge, because headless screenshots never paint scrollbars.
  - **T1 — no change:** all 12 isotypes match their brands at 48px on #0A0600. Prisma keeps its 2026 mark.
  - **Checks:**
    - `pnpm test` after each task; the last run had 3,641 passing plus 1 expected fail.
    - typecheck and lint clean.
    - `pnpm build` exit 0.
    - Parent spot check: reader and shared/ui, 97 of 97.
  - **Visual check:** shots are in scratchpad `shots-polish/`; the parent viewed the 1440 and 390 shots scrolled to 400px.
    - **Parent observation:** on desktop the line of body text directly under the compact headline stays legible as it scrolls beneath it. The backdrop fade ends too close to the line.
  - **Follow-ups:**
    - Strengthen or extend the desktop backdrop fade under the compact headline.
    - `src/app/layout.tsx` preconnects to `api.fontshare.com` with `crossOrigin`, so the connection is not reused for the stylesheet. Remove `crossOrigin` on the `api.` host only (outside this task's surfaces).
- 2026-10-07, **RDD for T4–T7.** Assessed medium (`slice_budget_reached`, 1003 lines). Consent granted, one lens (reliability). Lineage `review-903439202f780379` over `e621909..a7ed826`: **approved and acknowledged**, authority burned. The reviewed boundary is now `a7ed826`.
  - **Advisory findings, folded into T8:**
    - `R3-git-dependent-font-guard` (warning): the font guard shells out to `git ls-files`. It fails without git or a work tree, and it also flags untracked local files.
    - `R3-spy-line-not-rebuilt-on-panel-resize`: the scroll-spy line is rebuilt only on window resize. It needs a ResizeObserver on the panel.
    - `R3-global-section-ids`: `document.getElementById` uses unscoped slugs. Lookups should stay within the panel.
- [x] **T8 — Polish fixes.** Done in `8828099`:
  - Make the desktop backdrop fade under the compact headline hide the line beneath it.
  - Rewrite the font guard as a filesystem walk with no git dependency.
  - Scope section lookups to the panel.
  - Rebuild the spy line with a ResizeObserver.
  - In `src/app/layout.tsx`, remove `crossOrigin` from the `api.fontshare.com` preconnect only, keeping it on the CDN host.
  - Route: delegated (writer F).
- 2026-10-07, **T8 done** in `8828099` (`fix(reader): solid backdrop under the compact headline and sturdier index`). Writer F. 6 files, +244/−17.
  - **Fixes:**
    - **Backdrop:** a deeper layer sits over the text column. It is solid for 2rem under the compact line, then fades over 24px.
    - **Landing point:** headings jumped to from the index now land at `--case-land` (172px desktop). The index stays at `--case-anchor` (132px). The stacking context created by `rise-late` stops the index from being lifted above the bar.
    - **Font guard:** now a filesystem walk with no git dependency. It runs in about 6ms and skips build and cache folders plus the root `resources/` folder, which `.gitignore` reserves for licensed local fonts.
    - **Heading lookups:** scoped with `root.querySelector('#'+CSS.escape(id))`. A test mounts two panels.
    - **Scroll-spy:** a ResizeObserver on the panel rebuilds the spy margin.
    - **Fontshare preconnects:** the `api.fontshare.com` preconnect no longer has `crossOrigin`; `cdn.fontshare.com` keeps it.
  - **Checks:**
    - `pnpm test`: 3,650 passed plus 1 expected fail.
    - typecheck, lint and build all exit 0.
    - Parent spot check: reader and layout tests, 87 of 87 passed.
  - **Visual:** shots are in `shots-polish/t8-*`. The parent viewed the shot at 1440 wide scrolled 900px: there is a solid band under the compact line, and only the fading line is dimmed. Switzer and Gambarino both load.
  - **Accepted small leftovers:**
    - At xl, the edge of the band shows where it cuts the background particles.
    - `cdn.fontshare.com` has two preconnects that are not deduped. This is harmless.
- 2026-10-07, **Delivered.** The user said "si". `main` was fast-forwarded from `c29015e` to `13343f2` and pushed.
- 2026-10-07, **User feedback after the deploy, with two screenshots:**
  - **Image #6:** the hover/focus bracket frame around the "INFRAESTRUCTURA" stack category spans the whole aside column. The user's words: "No me gusta que ocupe todo el ancho, siendo que es mas chico el texto. Me parece impreciso."
  - **Image #7:** the Proyectos list row puts the meta on guide 1, the logo on guide 3 and the summary on guide 5, near the right edge. The user crossed out the meta and wrote: "Considero que la visualización así, lo deja MUY desequilibrado".
  - **The user's choice:** "Logo y resumen en línea". Drop the meta from the list. One line from the column-1 axis: logo, a fixed gap, then the summary. Across rows, the summaries start at the same x.
- [x] **T9 — Balanced list row.** Done in `1009be5`.
  - Remove the meta from the list row. It still shows in the case study.
  - Put the logo and the summary on one line, starting at the column-1 axis, with a fixed gap.
  - The list is a `max-content 1fr` grid, so every summary starts at the same x.
  - The hover and focus frame hugs the row's content.
  - Phones stack the logo above the summary.
  - Route: delegated (writer G).
- [x] **T10 — Precise interactive boxes in the case study.** Done in `39ba7ab`.
  - Stack category buttons, index entries and any other control with the bracket frame size to their content, using padding for the hit area instead of full width.
  - Route: delegated (writer G).
- 2026-10-07, **T10 done** in `39ba7ab` (`fix(reader): size case-study controls to their content`). Writer G.
  - **Change:** stack category buttons and index entries now size to their content (`w-fit`). Categories keep `min-h-9` and index entries `min-h-8`, and the text stays on the axis. Section headings also use `w-fit`, so the focus ring after a jump hugs the words.
  - **Measured:** the "Infraestructura" frame went from about 585px to 149px.
- 2026-10-07, **T9 done** in `1009be5` (`fix(facets): put the project logo and summary on one balanced line`).
  - **Change:** the meta and its `aria-describedby` are gone from the row. From md up, the list is a subgrid with columns `max-content minmax(0,max-content)`, which `1fr` would have stretched to full width.
  - **Layout:**
    - The summary starts after a 2rem gap and is baseline-aligned with the logo.
    - Summaries align across rows. Checked with cloned rows: every summary starts at x 340.7, and a title-only row stays in column 1.
    - On phones the logo sits above the summary.
  - **Measured:** the frame went from 1,350px to 563px. The title, logo and frame share the same axis (x about 51).
- **Checks:**
  - `pnpm test`: 3,657 passing plus 1 expected fail.
  - typecheck, lint and build: exit 0.
  - Parent spot check: typecheck exit 0.
- **Visual check:** shots in scratchpad `shots-balance/`. The parent viewed the list row hover at 1440 and the category hover: both frames hug their content.
- **Caveats:**
  - Each row's frame is as wide as the widest row.
  - A future logo with a descender would sit the baseline-aligned summary low.
  - Firefox may not apply a subgrid inside a `<button>`. If not, the row falls back to a single line without cross-row alignment.
- 2026-10-07, **RDD for T8–T10.**
  - Assessed medium (`slice_budget_reached`, 548 lines). Consent was granted and one lens (reliability) ran.
  - Lineage `review-0a8afc528a523922` over `a7ed826..4ed6042`: **approved and acknowledged**, authority burned. The reviewed boundary is now `4ed6042`.
  - **Advisory follow-ups:**
    - `R3-font-guard-flags-ignored-local-output` (warning): the filesystem walk skips a fixed list of folders, unlike the old `--exclude-standard`. A font sitting in some other gitignored local folder would fail the test even though it could never be committed.
    - `R3-spy-margin-dedupe-unproved` (suggestion): no test covers the early return in `watch()` when the margin is unchanged.
- Next: the user's approval to fast-forward `main` and push.
