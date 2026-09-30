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

- **Reading rhythm: TAP TO CONTINUE** (changed from MIXED at the user's request, 2026-09-30; see "Per-word flicker, tap to continue"). The MIXED decision below is superseded.
- ~~Reading rhythm: MIXED~~ (the user's first choice).
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

## Per-word flicker, tap to continue (branch `feat/reader-tap`, 2026-09-30)

User: "se ve como titilando cada palabra ... la intro palabra por palabra en 2 segundos ... más velocidad y un 'Tap para continuar' ... que pase según esa persona tapee."

- **Flicker: confirmed cause (c).** Measured with Playwright (Chromium 1440x900, 2x): one word's paint transition was seeked frame by frame (`getAnimations()` paused, `currentTime` stepped, 2x clip screenshots, mean luma of the word rect).
  - `-webkit-text-stroke-width` does not interpolate in Chrome: only `color` and `-webkit-text-stroke-color` showed up as running transitions. The width jumped 0.75 to 0 at t=0, so the outline vanished at once and the fill faded in from nothing.
  - Before: outline 29.35, at t=0 of the paint 12.84 (the background, a 56% drop), then a slow rise to 38.72 over 420 ms: every word blinked out, then in.
  - After: outline layer 28.32 at t=0, never below 28.3, peak 38.43 (3.6% over the final 37.11, from the two layers overlapping), no dip.
  - Refuted: (a) `will-change` / `data-settled` toggling per word (MutationObserver over a whole first paragraph: 23 `data-p` flips and one stack write, `will-change: auto` throughout), (b) re-mounting (0 childList mutations), (d) snapLayout re-applying translates (one stack transform write per motion, none per word). Neighbour words (already painted, not yet painted) are pixel-identical while one word paints, before and after.
  - Fix: the outline is its own layer, `.rd-w::before` with `content: attr(data-t) / ""`, that fades with opacity (300 ms, 140 ms delay) while the fill layer (`.rd-w`, color only) fades in over 420 ms. The fill layer never has a stroke, so the resting word is solid ink with no stroke and no filter. `use-stack-motion` also stopped re-writing `data-settled` with the same value.
  - Guards: `painting.test.tsx` (same span nodes across a paint, only `data-p` mutates, stack and blocks untouched) and `sharpness.test.ts` (no stroke on the fill layer, outline fades by opacity, no stroke-width transition).

### Tap to continue (same branch)

- **Pace.** 300 wpm (200 ms for an average word, length scaling x0.7-1.9 kept), pauses comma/semicolon/colon 90 ms, full stop/question/exclamation/ellipsis 220 ms, paragraph end 300 ms.
- **No auto-advance.** `paragraphDone` hand-over and `settleMs` are gone. A paragraph paints, then waits however long the visitor takes.
- **Tap / click** anywhere on the stage outside buttons, links and the progress: while painting it completes the paragraph (the rest fills in ~150 ms via `data-rush`); once done it advances with the same snap spring. Enter and Space do the same. Wheel, swipe and ArrowDown/PageDown keep snap and pan: pan first if tall, then complete a painting paragraph, then advance. The bottom zone lets taps through (`pointer-events`), and the surface has `cursor: pointer` so iOS fires the click.
- **Hint.** Silkscreen `t-label`, centred in the bottom zone (same baseline and `--control-h` as the progress and Saltar): "Toca para continuar" on `(pointer: coarse)`, "Haz clic para continuar" otherwise. It fades in (600 ms, 350 ms delay) only once the paragraph is done, breathes 0.55 to 1 over 2.4 s ease-in-out (static under reduced motion), and is hidden on the last paragraph, where Continuar (existing, at 100%) takes its place.
- **Progress and `story_completed`** are unchanged.
- **Evidence.** Machine, timeline, story-view and CSS-guard tests first (RED), then GREEN; Playwright Chromium 1440x900 and WebKit iPhone 13 (screenshots `tap-*.png`): hint centred at the same y as the progress and Saltar (828 on desktop, 616 on the phone, 9 px and 17 px clear of its neighbours at 390 px), a tap advanced the focus, and the last paragraph shows Continuar with the hint off.
- 2026-09-30: First-paragraph jump fix (branch `fix/reader-first-jump`, user report: the first paragraph jumps as it appears). Cause confirmed with a per-frame Playwright sample (Chromium 1440x900 and 390x844): the stage arrived with the `rise` animation (translateY 12 px, 600 ms delay, 900 ms), and `use-stack-motion` measured the stage origin with `getBoundingClientRect()` while that transform was still applied, so the stack was placed for a stage 12 px off its resting place; the paragraph drifted up 12 px with the rise while the first words painted, then the `animationend` re-measure snapped it back 12 px in a single frame (desktop 306 to 318, phone 229 to 241 at t = 1534 ms). Fonts (`loaded` from frame 0), stage height, bottom zone and title were constant and are ruled out. Fix: the stage now arrives with `turn` (fade and blur, no travel), so its rect is its resting place at every measure, and the `animationend` re-measure is gone. Test-first: a CSS guard in `sharpness.test.ts` (RED on the `rise` keyframes, then GREEN). After: first paragraph top 318 (desktop) and 241 (phone) in every frame from 27 ms on, 0 px delta.

## Next step

T4: RDD per policy, then push after the user approves.
