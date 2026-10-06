# Work path

- **Locator:** `odd/tasks/work-path.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/work-path/tasks` (project `theduck`)
- **Branch:** `feat/work-path` from `main` @ `33e6310`

## Objective

Give recruiters a public way to see my work without the Instagram gate or the memories. Right after the greeting, ask the visitor what they came to see. "Mi trabajo" opens the same galaxy at a public, linkable `/trabajo` with every star off except Proyectos. "Mi historia" keeps today's path. Document the first real project, Voltaicco (the `ecoflow` repo), and link it from Proyectos.

## User request (2026-10-06, verbatim)

"Bueno, me gustaría documentar un proyecto, que se llama ecoflow
Y vincularlo al proyecto my-life.
Pero vamos a cambiar un poco la interacción inicial.

Es decir, lo primero que hace luego de saludar, es, llevarte a colocar el IG, pero si un reclutador está buscando? No deberia tener acceso a mis recuerdos y esas cosas.
Así que, antes de msotrarte el portal, que te pregunte si Queres ver mis trabajos / Proyectos ETC ETC algo que mejore ese user journey"

Choice (2026-10-06): "Ruta pública /trabajo", with the note "O sea, que te lleve a la misma galaxia, pero con el resto de estrellas apagadas."

## Evidence (explorers, 2026-10-06)

- **Journey.** First visit: greeting → three phrases → story → hardware → Instagram gate → sky → orb portal → memories. Returning visitors (`localStorage["my-life:onboarding:v1"]`) see only the greeting, then the gate.
  - Onboarding: `src/features/onboarding/onboarding-machine.ts`, `use-onboarding.ts`, `onboarding.tsx`, `experience.tsx`.
  - Journey: `src/features/journey/journey-machine.ts:36`, where `initialJourneyState.screen` is always `"gate"`.
- **Gate.** `checkHandle` → `admitVisitor` → `EnvWhitelistPolicy` (`INSTAGRAM_WHITELIST`), which sets the signed `ml_visitor` cookie. The memories Server Actions enforce `currentVisitor()` on the server. The facets are static client data, hidden only by the UI gate.
- **Projects.** The only thing there is a placeholder facet, `projects` / "Proyectos", in `src/features/facets/content.ts:41-47`. `Reader` renders hard-coded placeholder pages (`reader/reader.tsx:9-13`). There is no route, model or content folder for projects.
- **Content.** `loadStory` → `parseStory`, a strict subset: paragraph, em, strong, quote, break and `##`. Anything else fails the build. `next.config.ts:8-9` traces `./content/**/*.md` for `/` only.
- **Voltaicco** (`C:/Users/patri/dev/work/desa/ecoflow`, private, sole author, 196 commits, 2026-09-25 → 2026-10-06):
  - A monitoring console for a fleet of EcoFlow power stations used as UPS units. Help-desk operators escalate at 80/50/20% battery. It is an MVP pilot.
  - Stack: Next.js 16, React 19, TS strict, Tailwind 4, Prisma 7 + Neon, Better Auth (Google, Workspace domain), Zod 4, Vitest with an 80% coverage gate (1415 tests, ~94% lines), GitHub Actions CI, Vercel.
  - Highlights:
    - screaming + hexagonal modules;
    - an HMAC-SHA256 signed vendor API;
    - opaque HMAC device URLs;
    - fail-closed remote outlet control (kill switch, allow-list, audit before send, read-back verification);
    - RBAC with three roles;
    - WCAG 2.2 AA.

## Decisions

- **The fork.** Right after the greeting, a choice screen asks "¿Qué vienes a ver?" with two options, "Mi trabajo" and "Mi historia". It is the same for first-time and returning visitors, and it cannot be skipped. "Saltar" lives only on the story path.
  - "Mi historia" keeps today's flow. A first visit gets the phrases, story, hardware step, gate and sky. A returning visitor goes to the gate.
  - "Mi trabajo" navigates to `/trabajo`.
- **`/trabajo`.** A public route that renders the same galaxy in a "work" mode:
  - The journey starts at `sky`, with no gate.
  - Only the Proyectos star is lit and interactive. The other stars are drawn off: dimmed, not focusable, not clickable.
  - The memory orb is not rendered.
  - Clicking Proyectos opens the place list, and then an entry.
  - A quiet "Mi historia" link goes back to `/`.
  - There is no hardware step, to keep friction low for recruiters.
  - `/trabajo/[slug]` deep-links straight to one project entry. Back goes to the Proyectos list.
- **Projects content.** Each project is a Markdown file in `content/projects/`. Frontmatter holds the structured fields; the body uses the same `parseStory` subset, so it has no lists and no links.
  - Proyectos is fed from that folder in every mode, including after the gate. The other facets keep their placeholders.
  - `next.config.ts` traces `content/projects/**` for the routes that read it.
- **Privacy for Voltaicco.**
  - No client or company name, and no Workspace domain.
  - No serial numbers, emails, telemetry or Figma key.
  - No link to the private repo. No link to `voltaicco.vercel.app`, because it sits behind company sign-in.
  - The client is described generically.
- **Copy.** The UI copy uses neutral Spanish with tú, matching the existing screens. The case study is written in the first person, in Spanish, as a draft the user will edit.
- **Out of scope:** the observation that `ml_visitor` is never read to skip the gate, so admitted visitors retype their handle on every visit. It is a separate follow-up.
- **Delivery.** The same as every earlier feature: one feature branch with work-unit commits. After review and the user's approval, `main` is fast-forwarded and pushed. Strategy `single-pr`. RDD runs per commit from the last reviewed boundary, starting at `33e6310`.

## Forecast

About 950 authored changed lines: T1 ~350, T2 ~350, T3 ~250.

## Tasks

- [ ] **T1 — Projects content and the Voltaicco case study.**
  - Write `content/projects/voltaicco.md` and a typed loader with tests.
  - Feed the Proyectos facet and `Reader` with real project entries.
  - Add `next.config.ts` tracing.
  - Route: delegated (writer trigger, 2+ non-trivial files).
- [ ] **T2 — `/trabajo` work mode.**
  - Public `/trabajo` and `/trabajo/[slug]`.
  - The journey starts at `sky` with no gate, only Proyectos lit, and no orb.
  - Deep link to an entry, plus the "Mi historia" link.
  - Route: delegated (writer trigger).
- [ ] **T3 — The fork after the greeting.**
  - An onboarding `choice` phase after the greeting, for first-time and returning visitors.
  - "Mi trabajo" goes to `/trabajo`; "Mi historia" continues today's flow.
  - Tests.
  - Route: delegated (writer trigger).

## Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build` once, at task closure.

## Progress

- 2026-10-06: Explored both repos and recorded the decisions above.
- 2026-10-06, **T1 implemented** in `d523606` (`feat(projects): load project case studies and document Voltaicco`). Route: delegated (writer trigger, 26 files). Diff: 797 lines added, 69 removed (~866 changed against the ~350 forecast; about 350 of those are tests).
  - **Checks, as the writer reported them:**
    - `pnpm test`: 3,396 tests in 193 files, all passing (the baseline was 3,355).
    - `pnpm typecheck` and `pnpm lint` both exit 0.
    - The parent re-ran `pnpm vitest run src/features/projects` (23 passed) and scanned `content/projects/voltaicco.md` for links, emails and company names (none found).
  - **RED → GREEN** was observed for each behavior. The only exception is the tracing guard, because the existing `./content/**/*.md` include for `/` already traces `content/projects`.
  - **Frontmatter:** `slug`, `title`, `updated`, `role`, `period`, `summary`, `stack[]`, `order`. The build fails on any bad field, a repeated slug or order, or an unsupported body.
  - **Data flow:** `page.tsx` calls `loadProjects()` and the projects pass through `Experience`, `LazyJourney` and `Journey`. `facetsWithProjects()` builds the Proyectos entries, `FacetPlace` lists them and `Reader` shows them.
  - **Reader changes:** a new static `page-block.tsx`, because the intro's `ReaderBlock` is absolutely positioned for its animation. Pages break at `---`, and the page area is `min-h-[272px]`. `summary` is not shown yet; T2 uses it for metadata.
  - **RDD:** assessed medium, `slice_budget_reached`, so a review is due. The review is pending.
