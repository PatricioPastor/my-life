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
- [ ] **T3 — Focused reading.** Focus styling, the snap and spring scroller (wheel, touch, keys), outline → fill painting at reading rhythm, mixed auto-advance, progress, "Continuar" at 100%, reduced motion, accessibility, screenshots (including a WebKit/iPhone viewport).
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

## Next step

Writer runs T1 + T2, then T3.
