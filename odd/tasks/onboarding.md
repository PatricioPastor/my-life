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
  - Served through the **Fontshare API** (`api.fontshare.com`), which the FFL license contemplates. The stylesheet is injected by the onboarding (not the root layout) and the first phrase waits up to ~800 ms for the face, so there is no swap.
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
  - Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render, "software"), or no WebGL2, show a suggestion with browser-specific steps and track `hw_accel_suggested`.
  - A masked renderer (WebGL2 works, unmasked renderer hidden) is `unknown`: a soft line ("Si notas tirones, ...") with the steps behind a "Cómo" disclosure, and no event.
  - A hardware renderer shows a short confirmation.
  - The probe reads the renderer only, off the render path; the sky program compile stays in the idle warm-up.
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
- 2026-09-30: Review follow-up: Gambarino stylesheet moved out of the render-blocking root head (preconnect kept) and awaited with an 800 ms cap; unknown GPU verdict is soft and silent; the renderer probe is light and off the render path.

## Letter assembly (2026-09-30)

User feedback: more time between phrases, and letters that form the sentence from irregular origins instead of the whole phrase appearing at once.

- **Assembly.** Each phrase is split into letters (words stay `inline-block` / `nowrap`, spaces stay real spaces). Every letter is in its final place from the first frame at opacity 0, so nothing reflows. One `@keyframes ob-letter-in` driven by per-letter custom properties (`--dx --dy --rot --scale --blur --delay --dur`) animates only transform, opacity and filter to `none` (fully settled). `will-change` is set only while letters move (a `data-animating` flag flipped by timers, no per-frame JS).
- **Timeline.** Pure `letter-timeline.ts` (seeded per phrase, mulberry32): offsets ±28–60 px, rotation ±8–18°, scale 0.85–0.95, blur 4–6 px, stagger 65 ms per character + 0–60 ms jitter (order preserved), travel 900–1200 ms, ease `cubic-bezier(0.22, 0.75, 0.3, 1)` (no overshoot). `phrases.ts` derives the phase durations; the machine receives them injected via `start` (nothing hard-coded to 1500 ms).
- **Timings (enter + hold + exit = total).** greeting: 1613/1696 + 1800 + 631/637 = 4044/4133 ms (buenoniaa/buenanochee); "esta, es mi vida": 2081 + 1800 + 629 = 4510 ms (hold was 2500 ms, then 2300 ms, until the 1.8 s change); "pero narrada de una forma diferente": 3273 + 700 (a beat, then the CTA; it never exits) = 3973 ms. Exit: letters fade, blur 4 px and drift 3–6 px up over ~440–470 ms each with a 0–180 ms random stagger. Returning visitors: greeting 1613 + 600 hold, no exit (2213 ms).
- **A11y / reduced motion.** Full sentence once in an `sr-only` span; letter spans `aria-hidden`. Reduced motion: opacity-only fade with a ~0.3x stagger, same holds.
- **Evidence.** Vitest (letter-timeline, phrases, machine, component), Playwright on :3001 at 1440x900 (150/500/900 ms, formed, mid-exit, next phrase) and 390x844: fully formed letter rects match a non-animated baseline render with 0.000 px max diff (13 letters), computed opacity 1, no transform, `will-change: auto` at rest. Known trade-off: per-letter spans drop kerning between letters (visually negligible at this size).

## Replay the intro (2026-09-30)

User request: "¿Qué pasa si quiero ver toda la intro de nuevo? ... un CTA que haga toda la intro ... Bajalo a 2.3 segundos."

- **Timing.** The middle phrase hold went from 2500 ms to 2300 ms (`phrases.ts`); it was later lowered to **1800 ms** for the greeting and the middle phrase (story-reader T1), and the last phrase keeps its 700 ms beat.
- **"Ver intro" control.** A real `<button>` (`journey/replay-intro-button.tsx`, Silkscreen like the back buttons, `data-magnetic="light"`, `.press`), bottom-left, shown by `Journey` on the gate (not during the warp) and on the sky, not inside a facet or entry. It renders only when `Experience` passes `onReplayIntro`.
- **Machine.** New `replay` event, valid only from `done`: restarts at the greeting with `returning: false` (the full sequence, ignoring `seen`), `skipped: false`, and sets `replayed`. `journeyWanted` is true while `replayed`, so the Journey (and its WebGL) never unmounts; the onboarding layer simply comes back over it and fades out again as on first visit.
- **Sky state is kept.** After a replay the visitor lands where they were (gate or sky), not forced back to the gate: resetting would need a Journey remount, which tears down and rebuilds WebGL.
- **URL shortcut.** `?intro` / `?intro=1` (not `0`/`false`) forces the full intro on load (`forced-intro.ts`, read client-side in `useOnboarding`, so `/` stays static).
- **Analytics.** `intro_replayed`, allow-listed, no props (tracked from the control only, not from `?intro`).
- **A11y.** Native button named "Ver intro"; reduced motion follows the existing onboarding rules.
- **TDD.** Machine, `forcedIntro`, timings, analytics allow-list, Journey control and an `Experience` test (click "Ver intro" on the gate restarts the greeting and walks the full sequence with the Journey mounted once).

## Two seconds per phrase (2026-09-30)

User: "la transición de la intro ... modificarlo a 2 segundos, sino tarda mucho tiempo entre cada una."

- **Cycle.** Each phrase cycle (enter + hold + exit) is about 2 s for the greeting and "esta, es mi vida": enter ~0.9 s, hold 700 ms, exit ~0.29 s. Measured totals: buenoniaa 1899.5 ms (911.5 + 700 + 288), buenanochee 1888 ms, "esta, es mi vida" 1917.8 ms. The last phrase enters in 963.7 ms, holds a 400 ms beat and hands over to the CTA (1363.7 ms, no exit). A returning visitor's greeting is 911.5 + 300 hold = 1211.5 ms, no exit.
- **Letters.** The assembly is capped at `ENTER_CAP_MS` = 1000 ms whatever the phrase length: stagger = `min(65 ms, (cap - 700) / letters)`, seeded jitter up to 30 ms and never above 60% of the stagger (the left-to-right order stays strict). Travel 550-700 ms with the same no-overshoot ease, exit stagger 0-50 ms and 230-250 ms per letter. Origins, rotations, blur and scale ranges are unchanged, and the letters still settle exactly.
- **TDD.** Failing tests for the new totals, the cap, the squeezed stagger and the holds first; `letter-timeline.test.ts` and `phrases.test.ts`.

## Next step

T4: deliver (RDD per policy; push after the user approves).
