# Onboarding before the gate

- **Locator:** `odd/tasks/onboarding.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/onboarding/tasks` (project `theduck`)
- **Branch:** `feat/onboarding` from `main` @ `443bf68`

## Objective

Before the Instagram input, a smooth onboarding runs. It greets, tells the premise, offers a "why I made this" story on a textured black background in Gambarino, and ends by suggesting hardware acceleration. It also buys time to lazy-load the heavy parts (sky, tunnel, shaders), so the gate appears without jank.

## User request (summary)

1. **Greeting as one word.** "buenoniaa" by day, "buenanochee" by night. After 1.5 s it changes to the next phrase.
2. **Phrases.** "esta, es mi vida", then "pero narrada de una forma diferente".
3. **CTA.** "¿por qué creé esto?" opens a black background (textured or moving). The CTA becomes the title, and a body text follows (lorem ipsum for now) in **Gambarino**.
4. **Lazy loading.** The onboarding lazy-loads the page so it doesn't lag at the start.
5. **Hardware acceleration.** At the end, suggest enabling it.

## Decisions

- **Greeting.**
  - Local hour 6:00–19:59 → `buenoniaa`; otherwise `buenanochee`. Rendered as a single word.
  - Each phrase holds ~1.5 s with smooth transitions (opacity, blur and a slight letter-spacing settle). No hard cuts.
  - The CTA copy is "¿por qué creé esto?" ("creé" from *crear*, assumed from the user's "cree").
- **Font: Gambarino.**
  - Served through the **Fontshare API** (`api.fontshare.com`), which the FFL license contemplates.
  - The repo is public and the FFL forbids distributing the font files through a repository or publicly accessible servers. **No font file is ever committed**: `resources/` is gitignored and the user's zip stays local.
  - No subsetting or conversion, which the license also forbids.
- **Story view.**
  - Near-black background with animated film grain: a low-resolution noise canvas at ~12 fps, scaled up, low opacity.
  - The CTA morphs (FLIP) into the title.
  - The body text is a Spanish lorem-ipsum placeholder in Gambarino.
  - A "Continuar" action.
- **Lazy loading.**
  - The sky, tunnel and cursor are dynamically imported (`next/dynamic`, no SSR) and preloaded during the onboarding.
  - The WebGL sky program is compiled once offscreen ("warm-up"), so the first real mount is instant.
- **Hardware acceleration.**
  - At the end, detect WebGL2 and the unmasked renderer.
  - Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render, "software"), or no WebGL2, show a suggestion with browser-specific steps.
  - Otherwise show a short confirmation.
  - Then "Entrar" leads to the gate.
- **Returning visitors.**
  - A "Saltar" control is always available.
  - The completed state is remembered in `localStorage` (with a try/catch fallback). Returning visitors see only the greeting, then the gate.
- **Accessibility.**
  - Phrases are exposed as text.
  - Reduced motion uses fades only, with no grain animation.
  - Keyboard-operable CTA, skip and continue.
- **Analytics.** Optional allow-listed events: `onboarding_completed`, `onboarding_skipped`, `hw_accel_suggested`. No PII.

## Constraints

- Public repo: never commit `.env.local` or any font file.
- Conventional Commits with no AI attribution.
- Code in English; UI copy in Spanish (neutral, `tú`), using the user's exact phrases.
- Dev servers run on port 3001, and a writer stops only the PID it started, never by process name.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure logic is test-first: the greeting by hour, the onboarding state machine and timings, the renderer classification and browser steps, and the returning-visitor rule.

## Tasks

- [x] **T1 — Sequence and font.** Greeting and phrases machine, CTA, skip and remember, Gambarino through Fontshare, `.gitignore` for `resources/`.
- [x] **T2 — Story view.** Grain background, CTA→title morph, Gambarino body.
- [x] **T3 — Lazy loading, WebGL warm-up and hardware check.** Dynamic imports, offscreen compile, GPU classification with the suggestion, handoff to the gate.
- [ ] **T4 — Deliver.** RDD per policy; push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
- First visit: greeting → phrases → CTA → story → hardware step → gate, all smooth. Returning visit: greeting → gate.
- No font binaries tracked by git. Gambarino renders through Fontshare.
- The gate and sky mount without a visible hitch after the onboarding.

## Progress

- 2026-09-30: Document created. The user chose the Fontshare API for Gambarino.
- 2026-09-30: T1 done. Greeting, machine, storage and layer with tests; Gambarino via `https://api.fontshare.com/v2/css?f[]=gambarino@400&display=swap` (verified with curl: serves woff2 from cdn.fontshare.com); `/resources/` gitignored. Route: delegated writer (2+ non-trivial files).
- 2026-09-30: T2 done. Story view with 160x90 grain at 12 fps (paused when hidden, static on reduced motion), FLIP title morph via Web Animations, Gambarino lorem body. Hardware phase temporarily has a plain Entrar stub until T3.
- 2026-09-30: T3 done. Journey chunk lazy via next/dynamic (fetched on idle at mount, mounted at the hardware step so the gate is ready before Entrar); offscreen sky warm-up on idle during the story; GPU classification + browser steps; onboarding_completed/onboarding_skipped/hw_accel_suggested. Fixed: HeadlessChrome UA misread as Safari; `--font-gambarino` theme token; ghost magnet on the hidden story button.

## Next step

T4: deliver (RDD per policy; push after the user approves).
