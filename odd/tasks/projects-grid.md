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

- [ ] **T1 — Prompt copy.** `CHOICE_PHRASE` becomes "¿qué te trae por acá?", with its tests. Route: delegated, together with T2 (writer A).
- [ ] **T2 — Case study rewrite.** IoT, electro-dependent users, technology and architecture, with the new summary and meta. Route: delegated (writer A, which reads the ecoflow docs).
- [ ] **T3 — Proyectos list on the 6-column grid.** Title transition, guides, the full logo row and the summary. Route: delegated (writer B).
- [ ] **T4 — Case-study layout.** Sticky left column, the stack disclosure list, continuous text and no pagination. Projects only. Route: delegated (writer C).
- [ ] **T5 — Official tech isotypes.** Research the official SVGs (a read-only worker that downloads into the scratchpad), then add the assets, the manifest, the registry and the guard. Route: research is delegated in parallel; the integration goes with writer C.

## Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build` at closure.
- A visual check on desktop and on a phone.

## Progress

- 2026-10-07: interpretation confirmed by the user. Branch created. Next: writer A (T1 and T2), with the isotype research in parallel.
