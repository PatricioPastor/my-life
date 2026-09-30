# Magnetic cursor, contextual tooltip and star focus

- **Locator:** `odd/tasks/magnetic-cursor.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/magnetic-cursor/tasks` (project `theduck`)
- **Branch:** `feat/magnetic-cursor` from `feat/es-meta-analytics` @ `55d4247`
- **Delivery:** the user pre-authorized pushing everything to `main` when done ("Cuando termines todo, pushealo a main").

## Objective

The cursor becomes part of the universe:

- **Magnetic pull.** It pulls toward interactive things.
- **Tooltip.** A tooltip above the cursor names what is under it.
- **Contextual help in two steps.** First a visible glitch message appears bottom-right. Holding Ctrl then reveals a fuller explanation.
- **Most important.** When the magnet captures a star, the nebula dims a little and the star reveals itself with an irregular, entropic animation that calls attention.

## Decisions

- **Cursor.**
  - A custom pixel reticle with spring smoothing, never instant.
  - It exists only for fine pointers (`(hover: hover) and (pointer: fine)`). Touch keeps native behavior.
  - The native cursor is hidden only where the reticle is active.
  - Reduced motion keeps the reticle but drops the spring overshoot.
- **Magnetism.**
  - Interactive elements opt in with a `data-magnetic` attribute and a strength.
  - Within a pull radius the reticle bends toward the target center.
  - Inside a capture radius it locks and morphs into a `[ ]` frame around the target.
  - Facet stars have the strongest pull; buttons and rows get a light pull.
- **Tooltip.**
  - Above the reticle: the target's name. For stars, the facet name plus a small `Ctrl` keycap hint.
  - It follows the reticle with the same spring.
- **Two-step context** (stars only):
  1. After a short dwell (~500 ms) on a captured star, a panel appears bottom-right with a legible glitch-in effect: "Mantén Ctrl para saber más".
  2. While Ctrl is held, the panel expands and the facet description decodes in with a glitch or scramble.
  
  Releasing Ctrl collapses the panel back to the hint, and leaving the star hides it.
  - The descriptions are authored as editable Spanish placeholders in `facets/content.ts`.
  - The same text is exposed to assistive tech (`aria-describedby` on the facet button) and to keyboard focus.
- **Star focus (highest priority).** On capture:
  - The nebula dims smoothly (~40%).
  - The captured star reveals with an entropic animation: stepwise, seeded-random flicker; spikes that jitter in length; erratic orbiting particles that settle over ~1.2 s; a core that swells.
  - Release restores everything smoothly.
  - The shader gets explicit uniforms (focus index, focus amount, focus time, anchor count), replacing the hard-coded `i < 4` anchor assumption.
  - Reduced motion keeps only the dim, with no flicker or particles.
- **Mobile label clipping.** Facet labels flip to the left side of the star when they would overflow the viewport. This fixes "PROYECTOS" clipped at 390px.

## T0 — Hardening (accepted review follow-ups from es-meta-analytics)

- `security.txt`: switch from frozen-at-build to periodic revalidation, so `Expires` stays under a year without a redeploy.
- `resolveSiteUrl`: validate and normalize (add `https://` to a bare host; fall back on an invalid URL), so `metadataBase` never throws. Document the scheme in `.env.example`.
- The `security.txt` contact derives from `OWNER_HANDLE`.
- `gate_submitted` is tracked from the submit path, not from an effect.

## Constraints

- Public repo: `.env.local` stays untouched and uncommitted.
- Conventional Commits with no AI attribution.
- Code in English; UI copy in Spanish (neutral, `tú`).
- No analytics payload may carry a handle.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure logic is test-first:
  - the magnet math (pull and capture, spring step);
  - the dwell and Ctrl state machine;
  - the glitch text scrambler;
  - the entropic flicker schedule;
  - label side flipping;
  - the site URL normalization;
  - the `security.txt` contact derivation.

## Tasks

- [x] **T0 — Hardening.** The four accepted follow-ups.
- [x] **T1 — Cursor, magnetism and tooltip.** Plus label flipping on mobile.
- [x] **T2 — Contextual panel.** Dwell hint with glitch, Ctrl expands to the description, accessibility.
- [x] **T3 — Star focus.** Nebula dim and the entropic reveal in the shader. Screenshots.
- [x] **T4 — Deliver.** RDD approved; `main` fast-forwarded and pushed (pre-authorized).

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
- On desktop, approaching a star pulls the reticle, captures it, dims the nebula and plays the entropic reveal.
- The dwell shows the glitch hint bottom-right; holding Ctrl shows the description.
- Touch devices keep native behavior. Reduced motion has no flicker or glitch.
- No label clips at 390px.

## Progress

- 2026-09-30: Document created.
- 2026-09-30: T0 done (delegated writer). RED: 4 failing site-url tests (bare host, garbage, https-prefixed Vercel host, always-parses); GREEN: 220 passing. `security.txt` uses `revalidate = 86400`; contact derives from `OWNER_HANDLE` (moved to `shared/site/owner.ts`, re-exported by access-request); `gate_submitted` fires in the submit handler (guard test added; it already passed under the old effect, so it is a regression guard, not a RED).
- 2026-09-30: T1 done (delegated writer; route recorded: one writer for 2+ non-trivial files). RED: magnet.test.ts and label-side.test.ts failed on missing modules; GREEN: 220 -> 252 tests. Pure `magnet.ts` (pull/capture/hysteresis, exact spring, tooltip placement), `magnetic-cursor.tsx` (rAF + style.transform, fine pointers only), targets marked, facet labels flip left near the right edge.
- 2026-09-30: T2 done (delegated writer). RED: context-machine, glitch-text and the facet description assertions failed before implementation; GREEN: 278 + 4 facet-stars tests. Reducer hidden -> hint (500 ms dwell) -> expanded (Ctrl/Meta) with blur reset; seeded glitch decode; panel is an aria-live region with a decoding visual layer. Descriptions are editable placeholders wired to `aria-describedby`.
- 2026-09-30: T3 done (delegated writer). RED: shader assertions (uniforms, `i < uAnchorCount`, gas dim, reveal) and `focus.ts` / `focusIndexFor` tests failed first; GREEN: 302 tests. Verified with Playwright at a paused fake clock (200/700/1500 ms after capture, Ctrl panel, release, 390px label flip); shots in the scratchpad `shots/cursor-*.png`. Tuned: reveal effects gate on a fast ramp, motes orbit outside the swollen core, stronger disc flicker. Final: lint, typecheck, 302 tests and build pass; `/` static, security.txt revalidates daily.

- 2026-09-30: T4 done.
  - Parent spot check: `pnpm test` passed 302/302. Reviewed the screenshots at capture, 700 ms, with Ctrl, and after release.
  - RDD slice `8e89242..bcdf1a4`: assessed **high** (the `security.txt` route); consent granted by the user; four lenses → **approved**; acknowledged, authority burned (lineage `review-d8e5eb15212006b2`).
  - `main` fast-forwarded to include `feat/es-meta-analytics` and `feat/magnetic-cursor`, then pushed (pre-authorized by the user).

## Review follow-ups (advisory, not accepted yet)

- ~~`R4-cursor-captured-loop-never-idles`~~ resolved by the feel fixes below: the loop idles, `matchMedia` is read once, and rects are read at the top of each awake frame.
- `R2-gate-submit-reducer-run-twice`: `onSubmit` predicts the next state with a manual reducer run before dispatching.
- `R2-duplicated-integer-hash`: `hash01` is duplicated in `focus.ts` and `glitch-text.ts`; move it to one shared helper.
- ~~`R2-glitchframes-dead-in-production`~~ resolved: the panel now consumes `scrambleFrames` (see "Scramble panel fix" below).
- `R2-settle-comment-contradicts-constant`: the comment says 1.2 s but `SETTLE_END` is 1.4.
- ~~`R2-snap-state-on-dataset`~~ resolved: the snap is gone (the reticle is the pointer plus an offset that starts at zero).
- `R3-reticle-field-hide-test-vacuous`: the field-hide test passes without the check. Show the reticle first.
- `R3-context-panel-motion-path-untested`: only the reduced-motion path is tested.
- `R3-sky-focus-wiring-untested`: `focus()` bounds, clock restart and uniform uploads are untested.
- `R3-journey-focus-index-order-unasserted`: nothing asserts that `FACET_IDS` order matches the anchor order.
- `R3-contenteditable-cursor-gap`: the CSS restores the native cursor for input, textarea and select, but not for `contenteditable`.
- `R2-task-doc-next-step-stale`: fixed by this update.

## Fixes after user feedback (2026-09-30)

User report: the reticle "moves" on click, entering seems to need press-and-hold, and the reticle lags the mouse. Branch `fix/cursor-feel`. Evidence from a Playwright script (real `page.mouse`, GPU-backed Chromium, 1440x900):

| Symptom | Root cause | Evidence before | Evidence after |
| --- | --- | --- | --- |
| Frame jumps on mousedown | The press feedback was the CSS `scale` property on `.mc-frame`, the same element that carries the positioning `translate3d`. `scale` is applied after the translate, so it multiplied the translation by 0.92 and shifted the frame by 8% of its coordinates toward the top-left. It is also why the frame looked "one button size" off at the reader pager. | Frame center on mousedown moved by 85 px (gate submit), 94 px (star) and 96 px (pager next). | 0 px in all three (frame identical before and during the press). |
| Click "does not land" | The native cursor is hidden and the magnet pulls the reticle onto the target while the real pointer stays up to 22 px (stars) or 4 to 14 px (buttons, with hysteresis) outside it. The click hit the empty layer behind. | `elementFromPoint` was `div.absolute.inset-0`; the pager did not advance (3px and 14px off the edge). Clicks at the exact center worked. | The same clicks activate the captured target exactly once (page 2 to 3, 3 to 2); a click on the target itself is not doubled. |
| Reticle lags | The whole position went through an underdamped spring (omega 24, zeta 0.78). | Distance pointer to reticle in a 1300 px/s sweep: median 80.7 px, max 87.3 px. | median 0 px, max 0.1 px. |

Refuted candidates: the overlay never intercepted pointer events (`.mc` already had `pointer-events: none`; it is now explicit on every child), and no remount happens between mousedown and mouseup (centered clicks succeed). Parallax can still move a star under a still pointer while the lamp settles, so the layer now freezes while a target is captured.

Fixes:

- `stepFollow`: the reticle is the real pointer plus a critically damped magnetic offset. Free movement is exactly 1:1; only the pull, the release and the `[ ]` morph are eased (omega 28, no overshoot).
- The press scale moved to an inner `.mc-body`, so it can never touch the frame's position. Measuring is skipped while pressed, so `.press:active` cannot shift the capture center.
- `shouldForwardClick`: a window-capture click handler forwards a pointer click to the captured target once when it landed outside it (keyboard clicks, `detail === 0`, are untouched), and the matching pointerdown no longer reaches the sky (no stray sparkle). A target under the pointer now beats a held neighbour in `resolveMagnet`, so what you see is what you click.
- Journey freezes the label-layer parallax while a target is captured.
- The loop idles when the pointer is still, the springs are at rest and rects are stable for 30 frames; pointer, scroll, resize and DOM changes wake it. `matchMedia(reduced-motion)` is read once with a change listener, and rects are read before any style write in a frame.
- Deviation: the cursor layer was not portaled to `document.body`. `.mc` is `position: fixed` inside an untransformed `main`, and the measured frame center matched the target center to 0 px before any press, so a portal would not change anything.

RED (before the fix): `stepFollow`, `shouldForwardClick` and the click-forwarding, 1:1 movement, idling and press tests failed on missing exports or behaviour, 17 failures in total (for example `TypeError: stepFollow is not a function` and "expected 'held' to be 'under'"). GREEN: lint, typecheck, 320 tests and build pass; `/` stays static.

### Review round 3 warnings, resolved (commit "never swallow clicks on other controls and ease parallax on release")

- ~~`R3-click-forward-swallows-non-magnetic-targets`~~: `shouldForwardClick` now takes `onInteractive`, computed by the pure `isInteractive(target, stage)` (`a[href]`, `button`, `input`, `textarea`, `select`, `label`, `summary`, `[role=button]`, `[contenteditable]` except `false`, `[tabindex]` except `-1`; ancestors are checked up to the stage). Only empty space is forwarded. Tests: predicate table, the captured submit plus a click on the username input focuses the input and does not activate, links and labels are not prevented. Playwright: with the gate submit captured, a click 2 px left of the button (over the input) left `document.activeElement` on `#ig-handle` and the status unchanged.
- ~~`R3-pointerdown-sky-suppression-untested`~~: pointerdown is suppressed only for `button === 0`, only inside the stage, and only under the same predicate. Tests use a stage-level listener as the sky's sparkle drop: silent for a forwarded press, fires for a press on the star, on another control, with button 2, and outside the stage.
- ~~`R3-parallax-freeze-jump-and-untested`~~: new pure `stepParallax` (`journey/parallax.ts`): freeze holds the applied shift, the raw shift keeps updating, release eases with a critically damped spring (about 250 ms, exact closed form, frame-rate independent) and then tracks exactly again. Recapture: hysteresis verified by tests (a released star needs the pointer within the capture radius again, while holding survives capture + 10 px). Playwright: fast approach then release, gap 10 px between the frozen and the live shift, max per-frame delta after release 0.62 px (a snap would be 10 px).
- ~~`R3-pressed-can-stick-without-pointerup`~~: `pressed` clears on window blur and on `visibilitychange` to hidden (tests for both).
- ~~`R3-css-regex-test-cwd-dependent`~~: the stylesheet path is resolved from the test file (`import.meta.url`); the test passes from another cwd.

RED before the fix: 24 failing tests (for example "isInteractive is not a function", "expected vi.fn() to be called 1 times, but got 0 times" for the sparkle listener, "expected 'on' to be null" for blur and visibility, and the missing `./parallax` module).

## Scramble panel fix (2026-09-30)

User report: the context panel resized and looked broken while decoding (symbols of different widths reflowed the text). Branch `fix/scramble-panel`.

- Cause: the frames were written into the layout text itself (symbol glyphs, proportional widths), and the container also had an RGB-split/offset keyframe.
- Fix: `glitch-text.ts` became `scramble-text.ts` (`scrambleFrame` / `scrambleFrames`, 40 ms step). Only letters and digits scramble, matching case; spaces, punctuation and accents stay. The final text is the hidden sizing layer (`.cp-final`); frames paint in an `aria-hidden`, clipped, absolutely positioned overlay (`.cp-overlay`). The RGB-split keyframe is replaced by a 240 ms opacity and 2px blur ease-in. Durations: hint 600 ms, description 800 ms. `aria-live` still speaks the final text only; reduced motion shows the text at once.
- Evidence (Playwright, 1440x900, panel `getBoundingClientRect()` every 20 ms of a stepped clock): hint width 275.47/275.47 and height 44/44; description width 308.09/308.09 and height 69.39/69.39 (0 px variation). Screenshots `shots/scramble-hint.png` and `scramble-desc.png`.
- Known trade-off: a mid-frame line that gets longer wraps inside the overlay and is clipped, so trailing words can briefly disappear until they resolve.
- RED: `scramble-text` module missing (2 suites failed) and the two new component assertions (`.cp-final` and `.cp-overlay` undefined). GREEN: lint, typecheck, 359 tests and build pass.

## Next step

Feature delivered, with the feel fixes above on `fix/cursor-feel` (not pushed). Next, if the user wants: the remaining tests and cleanups listed above.
