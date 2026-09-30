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
- [ ] **T1 — Cursor, magnetism and tooltip.** Plus label flipping on mobile.
- [ ] **T2 — Contextual panel.** Dwell hint with glitch, Ctrl expands to the description, accessibility.
- [ ] **T3 — Star focus.** Nebula dim and the entropic reveal in the shader. Screenshots.
- [ ] **T4 — Deliver.** RDD per policy, then fast-forward `main` and push (pre-authorized).

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `/` stays static.
- On desktop, approaching a star pulls the reticle, captures it, dims the nebula and plays the entropic reveal.
- The dwell shows the glitch hint bottom-right; holding Ctrl shows the description.
- Touch devices keep native behavior. Reduced motion has no flicker or glitch.
- No label clips at 390px.

## Progress

- 2026-09-30: Document created.
- 2026-09-30: T0 done (delegated writer). RED: 4 failing site-url tests (bare host, garbage, https-prefixed Vercel host, always-parses); GREEN: 220 passing. `security.txt` uses `revalidate = 86400`; contact derives from `OWNER_HANDLE` (moved to `shared/site/owner.ts`, re-exported by access-request); `gate_submitted` fires in the submit handler (guard test added; it already passed under the old effect, so it is a regression guard, not a RED).

## Next step

The writer runs T0–T3.
