# Memory quality pass and long audio

- **Locator:** `odd/tasks/memory-quality.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-quality/tasks` (project `theduck`; pending while the Engram server is disconnected)
- **Branch:** `feat/memory-quality` from `main` @ `739542c`
- **Builds on:** `odd/tasks/memory-voice-canvas.md`

## Objective

Raise the quality of the memories dimension to a premium bar, and let audio memories run up to one hour.

## User feedback (2026-10-01, verbatim, with screenshots)

- "Quiero poder subir audios de hasta 1 hora, no quiero que se limite."
- **First render while approaching an orb:** "se ve así, de muy mala calidad y muy muy feo". The orb shows a blurry, upscaled photo.
- **Glass view:** "se ve como muy mal, pierde bastante calidad y además parece que el fondo que tiene, tiene overflow hidden porque se ve recortado por un cuadrado". The user circled square-clipped halo edges around the sphere. A harsh white specular blob sits on the photo.
- "La palabra Recuerdos puede desaparecer después de 2 segundos o hacerse mucho más chiquita." In the glass view it also collides with the caption.
- **Leaving the glass view:** "Cuando salís de la imagen, queda recontra bugueada". After closing, the screen shows:
  - the focused orb still rendered as a small photo sphere;
  - most other orbs missing;
  - a large white shape clipped at the bottom-left, likely the title.
- "Es muchísimo más mejorable la calidad en todo, vamos, sé crítico."

## Decisions

- **Long audio:** up to 60 minutes.
  - **Size cap:** set by the Cloudinary plan's maximum video/audio file size, verified in the docs. The default target is 100 MB, enough for 60 min of compressed audio (mp3, m4a or webm/opus). Uncompressed WAV is accepted only while it fits the cap, and the UI says so.
  - **Large files:** Cloudinary chunked upload where the docs require it. The audio is transcoded to a playable format at upload time (eager or async) instead of on the fly, because on-the-fly transformation is unsuitable for long or large videos and audio.
  - **Safari and iOS seeking:** playback must support byte ranges. Use Cloudinary range support if available; otherwise a Next route handler proxies the signed audio with `Range` support.
  - **Database:** the limits are relaxed by an expand-safe migration that drops and re-adds the CHECKs with wider bounds.
  - **Recorder:** the cap rises to 60 min. The UI shows elapsed time and size, and warns as it nears the cap.
- **"Recuerdos" title:** on arrival it shows large, then after about 2 s it shrinks into a small HUD label near the way back (a FLIP-style transform, ease-out). It is hidden while the glass view is open, so it never collides with the caption. Reduced motion uses a crossfade.
- **Image quality:** resolution follows the on-screen size.
  - The canvas orbs and the approach request the Cloudinary transform that matches the displayed diameter × DPR, stepping thumb → medium → full and crossfading as each loads. Nothing is ever shown upscaled beyond about 1.25×.
  - The glass texture uses the full image with mipmaps, trilinear and anisotropic filtering, and correct color handling.
  - The lens is less magnifying (no mushy center), and the specular is a subtle, physically plausible highlight, not a white blob.
  - The halo and glow never clip: the canvas has enough margin, or the halo is drawn outside the canvas in CSS.
- **Exit:** closing the glass restores the exact previous state: camera, orbs, edges, loops, title and HUD. It is covered by regression tests reproducing the reported sequence.
- **Quality bar:** a critical review of the whole memories experience (overview, approach, glass, exit, add dialog, orb in the sky), using the `impeccable` critique and polish references. Fix every high and medium finding.

## Constraints

- Public repo: never commit secrets. Agents never read `.env*`. Remote operations need the user's authorization.
- Conventional Commits with no AI attribution. Code and docs in English; UI copy in neutral Spanish (`tú`).
- Dev servers: port 3001 in the main directory, 3002 in the worktree. A writer stops only its own PID.
- `/` stays static. Migrations are expand-only. Keep review slices under about 1,800 changed lines.

## TDD

Strict (global `CLAUDE.md`). Runner `pnpm test`.

## Tasks

- [ ] **T1 — Long audio (up to 60 min)** (writer A, worktree `../my-life-worktrees/long-audio`, branch `feat/long-audio`).
- [ ] **T2 — Visual quality and bugs** (writer B, main directory).
  - The exit bug.
  - Resolution-aware images and the glass rebuild (texture quality, lens, specular, no clipping).
  - The title behavior.
  - The critical pass.
- [ ] **T3 — Integrate and review.**
- [ ] **T4 — Deliver.**
  - Apply the migration after authorization.
  - Live check: a long audio (e.g. 20–60 min of compressed audio), Safari range behavior, image quality at zoom.
  - Fast-forward main after approval.

## Progress

- 2026-10-01: Document created from the user's critical feedback.

## Next step

T1 and T2 in parallel.
