# Story reader: Markdown, type system and focused reading

- **Locator:** `odd/tasks/story-reader.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/story-reader/tasks` (project `theduck`)
- **Branch:** `feat/story-reader` from `main` @ `344d990`

## Objective

Turn the onboarding's "¿por qué creé esto?" into a reading experience:

- the content comes from a precisely formatted Markdown file, the same pipeline Historias and Escritos will use later;
- a uniform Gambarino type system and spacing grid;
- the paragraph being read has the focus and paints itself at reading rhythm;
- a bottom zone with progress and CTAs that never collides with Safari's URL bar.

## User requests (summary)

1. Shorten the transition holds to **1.8 s**.
2. Render the story from **Markdown with a precise format**. A parser grows into the default format for stories and more.
3. **Focused reading.** The paragraph being read is the most prominent; the others are small and dim.
4. **Type system for Gambarino:**
   - caps usage;
   - lowercase usage;
   - uniform case formats (TT / Tt / tt);
   - uniform tracking;
   - uniform line height;
   - a uniform font-size scale.
5. **Movement.** Scroll uses snap plus a settling "bounce", and the text paints progressively following a reading rhythm, with an outline → fill effect inspired by glyph outlines. Everything smooth.
6. **Bottom zone.** The completion percentage and the CTAs sit in a bottom zone well fitted to the viewport; in Safari the URL bar currently clips the button. Bottom padding is uniform, so the design feels like it has guides.
7. **Content file.** Leave a Markdown file for the user to write after implementation.

## Decisions

- **Reading rhythm: MIXED** (the user's choice).
  - The focused paragraph paints itself at reading pace (~220 wpm, longer for long words, extra pauses at commas and periods).
  - When it finishes, the next paragraph springs into focus.
  - A user scroll, swipe or key snaps to any paragraph and instantly completes the one being left.
- **Progress.** The percentage is visible throughout the reading, since a percentage shown only at the end would always read 100%. "Continuar" appears only at 100%. "Saltar" stays available.
- **Holds.** 1800 ms for the greeting and both phrases. The last phrase keeps its short beat into the CTA.
- **Markdown.**
  - The file lives at `content/intro/por-que-cree-esto.md`: frontmatter (`title`, `updated`) plus a strict subset (paragraphs, `*em*`, `**strong**`, `> blockquote`, `---` thematic break, `##` subheading).
  - Anything outside the subset fails the build with a clear message.
  - It is parsed at build time with remark/unified into our own typed blocks. No raw HTML is rendered and there is no `dangerouslySetInnerHTML`. `/` stays static.
- **Type system (Gambarino).**
  - Case:
    - titles are lowercase (`tt`, for example "¿por qué creé esto?");
    - body is sentence case (`Tt`);
    - UI labels are all caps (`TT`) and only ever in Silkscreen;
    - Gambarino is never set in sustained caps.
  - Scale: 1.25 ratio from an 18 px body: 18 / 22.5 / 28 / 35 / 44 / 55, fluid on small screens.
  - Line height: body 1.5, titles 1.1.
  - Tracking: body 0, titles −0.01em, Silkscreen caps +0.12em.
  - Everything is tokenized.
- **Grid.** Spacing in multiples of 8 px, with a uniform page margin on all sides, including the bottom.
- **Viewport.** `100dvh`, `env(safe-area-inset-bottom)`, and `viewport-fit=cover`, so the bottom CTA is never clipped by Safari's toolbar.
- **Painting.**
  - Each word starts as a glyph outline (`-webkit-text-stroke`, transparent fill) and fills in smoothly.
  - This is rendering only; the font is not modified, so the FFL license is respected.
  - Reduced motion shows text filled, with no spring overshoot and focus through opacity only.
- **Accessibility.**
  - All paragraphs are in the DOM in order and readable by screen readers.
  - Keyboard: ArrowDown / PageDown / Space moves next, ArrowUp moves previous.
  - The progress value is exposed.

## Constraints

- Public repo: never commit `.env.local` or anything under `resources/`. Gambarino loads only through Fontshare.
- Conventional Commits with no AI attribution.
- Code in English; UI copy in Spanish.
- Dev servers run on port 3001, and a writer stops only its own PID.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure logic is test-first:
  - Markdown subset parsing and validation;
  - frontmatter;
  - the reading timeline (word timings and pauses);
  - progress math;
  - the focus and snap state machine (auto-advance, user override, completion);
  - the spring settle;
  - the holds.

## Tasks

- [x] **T1 — Base.** 1.8 s holds; typography and spacing tokens; case rules applied to the existing Gambarino texts; `viewport-fit=cover` and a safe-area bottom zone.
- [x] **T2 — Markdown pipeline.** The strict subset parser at build time, typed blocks, the content file with a format guide and placeholder text, and the story rendering from it (still static).
- [x] **T3 — Focused reading.** Focus styling, the snap and spring scroller (wheel, touch, keys), outline → fill painting at reading rhythm, mixed auto-advance, progress, "Continuar" at 100%, reduced motion, accessibility, screenshots (including a WebKit/iPhone viewport).
- [ ] **T4 — Deliver.** RDD per policy; push after the user approves.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
- The story renders from `content/intro/por-que-cree-esto.md`, and an invalid construct fails the build.
- The focused paragraph is clearly dominant, and the others are small and dim.
- Painting follows the reading rhythm, and the next paragraph springs in after completion. A user scroll overrides.
- The progress percentage is accurate; "Continuar" appears at 100%; nothing is clipped at the bottom on an iPhone viewport.

## Progress

- 2026-09-30: Document created. The user chose the MIXED rhythm.
- 2026-09-30: T1 done (writer, delegated): holds 1800 (RED then GREEN), type/spacing tokens, `.t-title/.t-body/.t-label`, `--page-pad`/`--bottom-pad`, `viewportFit: "cover"`, bottom zone `.ob-foot`; lint/typecheck/test pass. Route: delegated writer (2+ non-trivial files).

- 2026-09-30: T2 done (writer, delegated): `src/shared/content/` (`parseStory`, `loadStory`, types), unified + remark-parse + remark-frontmatter + remark-gfm (to reject GFM extras by name) + yaml; `content/intro/por-que-cree-esto.md`; `/` static; an invalid construct fails the build with file and line. Checked with lint, typecheck, test, build and Playwright (Chromium 1440x900, WebKit iPhone 13).
- 2026-09-30: T3.0 done (writer, delegated): content test checks the pipeline, not the author text; emphasis in a `##` subheading reports a precise message; onboarding doc holds corrected to 1800 ms. Commit `ee3d6e0`.
- 2026-09-30: T3 done (writer, delegated, route: delegated writer, 2+ non-trivial files). Pure, test-first modules in `src/features/onboarding/reader/` (words, timeline, reader-machine, settle, wheel-gate, layout); UI = absolute-positioned stack laid out small and scaled up for focus (uniform scale keeps line breaks), spring-driven transforms written straight to the DOM, words painted by a `data-p` flip at word pace (state changes per word, never per frame), wheel/swipe/keys with a wheel gate, progress ring + `Continuar` at 100%, `story_completed` event. Parameters: 220 wpm base (272 ms/word, x0.7-1.9 by word length), pauses 120 (, ; :) / 300 (. ? ! …) / 500 (paragraph), settle 600 ms, spring omega 11 zeta 0.8 (reduced: omega 22 zeta 1), focus scale 1.5625 (two steps of the type scale), dim opacity 0.34, blur 1 px, paint 420 ms, stroke 0.75 px at 62% ink. Checked with lint, typecheck, test, build (twice for the first three) and Playwright (Chromium 1440x900, WebKit iPhone 13).
- 2026-09-30: Sharpness fix (branch `fix/text-sharpness`, user report: text looked blurry). Causes confirmed with computed styles and 2x screenshots (Chromium 1440x900, WebKit iPhone 13):
  - **Upscaled focus text.** The focused paragraph was laid out at 18 px and stretched by `scale(1.5569)` (Chromium) / `1.5625`, so it was rasterized small and enlarged. Now every block is laid out at the focus size (type-3, full column) and the ones out of focus are scaled DOWN by 1/1.5625; the focused block at rest has no scale (`matrix(1,0,0,1,0,0)`, font-size 28 px / 25.75 px on the phone).
  - **Fractional pixels.** The stack rested at `translateY(125.07px)`, and the focus opacity at 0.993 while the spring was still settling. At rest the offsets are now snapped to device pixels relative to the page (`snapLayout`), as 2D translates, with exact opacity 1 and `data-settled` on the stack.
  - **Leftover layers.** `.rd-stage` and `.ob-hw` kept `filter: blur(0px)` forever through `rise ... both`, and every phrase letter kept `filter: blur(0px)` plus an identity matrix through `ob-letter-in ... both`. Fill is now `backwards` only (also `.ob-story`), the `rise`/`turn` end keyframes use `filter: none`, letters rest at `transform: none; filter: none`, and the title's permanent `will-change` is gone.
  - **Weak fill.** Painted words were 90% ink with a transparent 0.48 px stroke still on. Now solid `var(--ink)` and stroke width 0; unpainted outlines keep the stroke.
  - **Rendering hints.** `text-rendering: optimizeLegibility` and grayscale smoothing on `.ob` (macOS only).
  - **Not a cause.** The grain canvas and vignette sit beneath the column in DOM order; the foot scrim only covers the bottom edge, which the mask already fades.
  - Checks: layout and snap tests first (RED, then GREEN), CSS guard test `sharpness.test.ts`, and before/after screenshots `sharp-{before,after}-*.png`.

## Next step

T4: RDD per policy, then push after the user approves.
