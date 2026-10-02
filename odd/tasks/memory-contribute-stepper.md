# Memory contribute stepper

- **Locator:** `odd/tasks/memory-contribute-stepper.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/memory-contribute-stepper/tasks` (project `theduck`)
- **Branch:** `feat/memory-contribute-stepper` from `main` @ `7ab14a0`

## Objective

Turn "Contribuir con un recuerdo" into a short, pixel-precise stepper with better copy and fewer elements. Fill the date and exact time automatically from the photo or the audio. Give orbs a wide, complementary palette so the memories space becomes a sea of colors. Redesign and align the "+ Contribuir" header button.

## User request (2026-10-02, verbatim, with screenshots)

"Será que al agregar foto y audio, agregue fecha y hora exacta tambien automaticamente
Y el wizard que permite agregar recuerdos.
Primeor, quiero que agregues varios colores de orbes, bien variados y complementarios, para que las memorias sean un mar de colores.
[Image #1]
Y el wizard, lo haría más stepper, mejoraria el writing y simplificaría la cantidad de elementos, tambien, el rounded ext = inner padding + inner radius para que tenga esa sensacion de encastre, mejora eso tambien, no esta muy precisa la interfaz en ese criterio, tiene que ser muy pixel perfect.
[Image #2]
El button, no me gusta del todo y ademas, no están alineados, me da a muy fea experiencia."

Screenshots: the current sheet (Foto dropzone, Grabar / Subir audio, six dashed swatch slots plus one orb tile, "¿Qué recuerdas?", sticky "Guardar recuerdo"), and the header with "‹ Universo", "Recuerdos" and a bordered "+ Contribuir" pill that does not line up with either.

## Evidence (explorer, 2026-10-02)

- Form: `src/features/memories/ui/add-memory.tsx` (Radix Dialog, Tailwind v4 inline). It is one long form, two columns from `md`. Submit: `prepareUpload` → Cloudinary XHR → `createMemory` (`actions.ts`).
- Radii are inconsistent: the sheet is 18px on top (8px on desktop) with 20px padding; fields, dropzone, audio box and submit are 6px; the orb tile is 8px; the preview image inside the `p-3` dropzone is also 6px.
- Date: `happenedOn` (`happened_on date`, required) is user-typed and never prefilled from media. `taken_at` comes from Cloudinary EXIF on the server only. Client `exifr` (`ui/photo-gps.ts`) reads GPS only. Audio has no date.
- Color: photo swatches come from a median cut (≤6). Audio-only and unreadable photos get `fallbackPalette()`, 4 cool hues (195–330). The default is `#8ab4ff`. The server accepts a pick only if `isGlowColor` (OKLCH L ≥ 0.70, C ≥ 0.08) and recomputes on read (`list-memories.ts:74`). The result is a mostly blue sky.
- Header: `BackButton` is `h-12 px-3 text-xs tracking-[0.08em]` with no box. The pill is `h-11`, bordered, `t-label` (line-height 1, 0.12em), with a different side inset (12px vs 20px on phones). "Recuerdos" hard-codes offsets that duplicate `top-bar.ts`. The glass view has a different, bare Contribuir.

## Decisions

- **Concentric radius system.** These tokens live in `globals.css`, and every nested surface in the sheet uses them:
  - `--sheet-r: 32px` and `--sheet-pad: 20px`. The sheet's top corners on phones, all four on desktop.
  - `--panel-r: calc(var(--sheet-r) - var(--sheet-pad))`, which is 12px: inputs, dropzone, audio panel, primary/secondary buttons and the close button.
  - `--panel-pad: 4px` and `--inner-r: calc(var(--panel-r) - var(--panel-pad))`, which is 8px: controls inside a panel, such as the audio segmented buttons.
  - The photo preview fills the dropzone, clipped by its radius. Badges in a panel corner use `panel-r − inset`.
  - One column at every width; the desktop dialog is `max-w-[30rem]` with the same padding.
- **Stepper, three steps.** Header: "Paso N de 3", a 3-segment progress bar and a close button. Footer: "Atrás" plus "Siguiente", and "Guardar recuerdo" on the last step. Each step validates only its own fields, on Next; the error sits by the field and focus moves to it. On a step change focus goes to the step heading and a live region announces the step. Transitions are a short crossfade plus a small translate, interruptible, and off under reduced motion. The submit pipeline is unchanged.
  1. **Foto o voz:** the photo tile, and the audio panel as a segmented [Grabar | Subir audio]. One short limits line.
  2. **El recuerdo:** "¿Qué recuerdas?", "¿Cuándo fue?" (date plus time, auto-filled, with a one-line source hint), and the place.
  3. **Su color:** a large orb preview, the swatch grid, the approval note and "Guardar recuerdo".
- **Copy.** Neutral Spanish using tú, matching the existing UI. Say each idea once; drop the paragraph intro and long help text.
- **Date and exact time.** A new nullable `happened_time time(0)` column holds the local wall-clock time. It is expand-only and snake_case, and the table already has RLS. The date stays required; the time is optional.
  - Auto-fill priority: photo EXIF `DateTimeOriginal` (raw wall-clock), then the recording start (local now), then an uploaded audio file's `lastModified` (marked as approximate), then the related memory's date (date only).
  - Auto-fill never overwrites a field the user edited, and ignores future values.
  - The server validates `HH:MM` and shows the time next to the date wherever the date is shown.
- **Palette.** A curated set of 12 hues at 30° steps around the OKLCH wheel. Lightness and chroma are tuned per hue so every hex stays in sRGB and passes `isGlowColor`.
  - The picker shows the photo tones (deduplicated) first, then the 12.
  - Audio-only memories default to a random curated hue, so contributions vary.
  - On read, a memory with no stored or dominant color gets a stable hue hashed from its id instead of the single blue. Stored picks are never overridden.
- **Header button.** "+ Contribuir" mirrors "‹ Universo": the same row height, type, tracking and mirrored inset, with a small glowing plus mark instead of a bordered pill. "Recuerdos" aligns optically with the back chevron and uses offsets derived from `top-bar.ts`. The glass view uses the same component.
- **Delivery.** Same as every earlier feature: one feature branch with work-unit commits; after review and the user's approval, `main` is fast-forwarded and pushed. The migration is applied only with explicit authorization. RDD runs per commit from the last reviewed boundary (`7ab14a0` first).

## Forecast

About 1,400 authored changed lines (T1 ~250, T2 ~400, T3 ~600, T4 ~150).

## Tasks

- [x] **T1 Palette:** curated 12-hue palette (gamut and glow tested), picker integration, random default for audio-only, hashed hue on read for colorless memories. Route: delegated writer (4+ files). Done in `53981ed`.
- [x] **T2 Date and time:** the migration, the domain, the server and the DTO; client EXIF date parse; recording and file times; the form fields with a source hint; the time shown in the viewers. Route: delegated writer (server plus UI). Done in `e1f940d`.
- [x] **T3 Stepper:** three steps, concentric radius tokens, copy rewrite, single column, focus and announcements, tests updated. Route: delegated writer (2+ non-trivial files). Done in `d8dbd34`, after the T2-advisory prelude `2f80414`.
- [x] **T4 Header:** Contribuir redesign and alignment, "Recuerdos" alignment, shared with the glass view. Route: delegated writer (2+ non-trivial files). Done in `eebb5d3`.
- [x] **T5 Verify and deliver:** browser screenshots at 390 px and desktop, design detector, full test/lint/typecheck. Apply the migration with authorization, then fast-forward `main` after approval.

## Checks

`pnpm test`, `pnpm lint`, `pnpm typecheck`, plus focused `pnpm vitest run <path>` during each task.

## Progress

- 2026-10-02: explored; branch created; document written.
- 2026-10-02: **T1 done**, commit `53981ed` `feat(memories): a wide complementary orb palette`.
  - T1 route: delegated writer (4+ non-trivial files).
  - The palette lives in `src/features/memories/orb-hues.ts`. Each hex was computed with the repo's `oklchToSrgb` + `toHex`; the OKLCH hue, lightness and chroma are listed below.

    | Hue | Hex | Name | L | C |
    |-----|-----|------|---|---|
    | 15 | `#f88d96` | rosa | 0.76 | 0.13 |
    | 45 | `#f8986c` | coral | 0.77 | 0.13 |
    | 75 | `#f9ba5f` | ámbar | 0.83 | 0.13 |
    | 105 | `#dfd65f` | limón | 0.86 | 0.14 |
    | 135 | `#a5de86` | verde | 0.84 | 0.13 |
    | 165 | `#6ce5b5` | menta | 0.84 | 0.13 |
    | 195 | `#47e0e0` | turquesa | 0.83 | 0.125 |
    | 225 | `#45cbf9` | cielo | 0.79 | 0.13 |
    | 255 | `#73aef8` | azul | 0.74 | 0.124 |
    | 285 | `#a39ef9` | lavanda | 0.74 | 0.13 |
    | 315 | `#daa0f4` | violeta | 0.79 | 0.13 |
    | 345 | `#f697ce` | magenta | 0.79 | 0.13 |

  - Each color uses at most about 93% of the sRGB chroma available at its hue and lightness, so nothing is clipped. Every pair is at least 0.0668 apart in OKLab (the test threshold is 0.06, the picker's near-duplicate rule). The largest hue gap is 30.6°.
  - Picker: the photo's own tones that no curated hue already offers (at most 6, dominant first), then all 12, in rows of six 44 px cells. A dominant tone folded into a curated hue selects that hue. With no tones (voice only, or an unreadable photo), the 12 alone, with one hue drawn at random once per open (`random` prop is the test seam). `fallbackPalette()` was removed.
  - Read: `toMemoryView` falls back to `orbHueFor(id)` (FNV-1a mod 12, pinned by tests) when a row has no valid stored color and no dominant color. Stored picks always win. The shared page uses the same path.
  - Accepted choice: photo tones close to a curated hue are dropped, so the 12 curated hues stay in the same place.
  - Scope note: with the user's approval, the surface was extended to `create-memory.test.ts` (one DTO expectation) and the doc comment in `ui/use-photo-palette.ts`.
  - Evidence: RED observed before each step (missing module, then failing assertions). `pnpm vitest run src/features/memories`: 88 files, 2124 tests passed. `pnpm test`: 184 files, 3156 tests passed. `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
- 2026-10-02: **T1 reviewed.** Reviewed boundary after T1: `5267d28`. Review `review-b22670a18fb853aa` approved and acknowledged. Two non-blocking advisories, for T3:
  - The "Los primeros colores salen de tu foto" note shows even when every photo tone was folded into a curated hue.
  - The copy test only checks the constant.
- 2026-10-02: **T2 done**, commit `e1f940d` `feat(memories): fill the date and exact time from the photo or the voice`.
  - T2 route: delegated writer (server plus UI, 2+ non-trivial files).
  - **Storage.** Migration `20261007000000_memory_happened_time`: one nullable `happened_time TIME(0)` column on `memories` plus `GRANT INSERT ("happened_time")` to `app_user`. It is expand-only and snake_case. Row-level security is untouched: `memories` keeps ENABLE + FORCE and its policies, because a new column does not change which rows a visitor may read or insert. Schema field `happenedTime DateTime? @map("happened_time") @db.Time(0)`. The Prisma client was regenerated with `pnpm db:generate` (`src/generated/` is gitignored, so nothing to commit). **Not applied to any database**; delivery applies it with authorization.
  - **Domain and server.** `happenedTime` is an optional wall-clock `HH:MM` (24 h), with no time zone. `isWallClockTime` in `memory.ts` is shared by `validate-new-memory.ts` (new error `time_invalid`; nothing, null and "" mean no time) and the client `memory-form-model.ts`. The date rules are unchanged. The repository writes `Date.UTC(1970, 0, 1, h, m)` and reads with the UTC getters, so the server's zone never moves it; tests cover 00:00, 07:05, 23:59 and null both ways. `MemoryView.happenedTime` is always sent by `toMemoryView`, so the shared page gets it too.
  - **Client auto-fill (`ui/memory-when.ts`, pure).** Each source keeps its own candidate, and the visitor's edit is kept per field (date, time); a cleared field stays empty. Shown value = the edit, else the best candidate. Priority: photo EXIF > recording start > uploaded audio file `lastModified` (marked `approximate`) > related memory (date only). A candidate counts only while its photo or audio is still there, so removing one recomputes. Candidates later than the local now, before 1900-01-01, or not real days or times are ignored when they are read. The related memory's date stays a candidate after its chip is removed, which keeps the earlier "the date they have stays" behavior.
  - **Photo.** `ui/photo-exif.ts` reads GPS and `DateTimeOriginal`/`CreateDate` in one exifr lite `parse` per file (cached in a `WeakMap`), with `reviveValues: false`, so the camera's `YYYY:MM:DD HH:MM:SS` stays a raw wall clock. `parseGpsWithExifr` now uses that same read, and HEIC goes through the same path as GPS. A test proves that one photo gives both GPS and time from a single parse. New seam: `parsePhotoTime`.
  - **Recording and file.** The recording candidate is the local time when Grabar is pressed (`clock` seam on `AddMemory`; `today` now defaults to the clock's date). The file candidate is `File.lastModified` as local time; 0 or less means unknown.
  - **Form (minimal, T3 redesigns it).** The date input now has an optional `<input type="time">` (aria-label "Hora", tabular numerals) beside it, and one hint line below: "Desde tu foto", "Cuando empezaste a grabar", "Según el archivo de audio" (`data-approximate`), "Igual que el recuerdo relacionado". There is no hint once either field is edited. Both inputs are described by the hint. Submit sends `happenedTime` or `null`.
  - **Display.** `formatMemoryWhen` adds " · HH:MM" to the existing date style, e.g. "14 de marzo de 2024 · 18:42". It is used in the glass caption (`tabular-nums`), the orb `aria-label` and cursor line (`memory-points.tsx`), and the shared page's metadata description.
  - **Stored color (the `#8ab4ff` follow-up).** The id is generated by the database, and app_user may not insert `id`, so the hue cannot be computed before the insert. `create-memory.ts` now stores `null` when there is no valid pick and no dominant color. `NewMemory.orbColor` is `string | null`, and the read path hashes `orbHueFor(id)`. A test makes the repository echo the inserted row and checks that the created DTO, `orbHueFor(id)` and a later `toMemoryView` of the stored row agree.
  - Compatibility: `Memory.happenedTime` and `MemoryView.happenedTime` are optional (`?: string | null`, like `MemoryView.photo`). That keeps two fixtures outside the T2 surface compiling unchanged: `views/record-view.test.ts` and `journey/mobile-layout.test.tsx`.
  - Size: about 1,283 changed lines (about 760 of them tests) against the ~400 forecast. This is advisory only. The work unit is one behavior (storage → DTO → auto-fill → display).
  - Evidence: RED observed before each step (server: 57 failing; `memory-when`, `photo-exif`: missing module; form: 13 + 6 failing; viewers: 2 failing). `pnpm vitest run src/features/memories src/app/m`: 92 files, 2246 tests passed. `pnpm test`: 186 files, 3264 tests passed (the first full run had one timing flake in `memories-place.test.tsx` "restores the camera exactly under reduced motion"; it passed 3/3 alone and on a full rerun). `pnpm lint`: exit 0. `pnpm typecheck`: exit 0. The PGlite migration test applied the new migration locally, and migration lint passed.
- 2026-10-02: **T2 reviewed.** Review `review-743eebc9b6d9f0e4` approved and acknowledged; reviewed boundary `d19ca43`. Its two advisories are resolved by the T3 prelude `2f80414` `fix(memories): anchor the EXIF clock and prove the happened_time grant`:
  - `ui/photo-exif.ts`: the clock regex is anchored at the end (`…(?::\d{2})?$`), so trailing text, a third seconds digit or a clock glued to more text are refused. exifr already strips the NUL padding of EXIF ASCII values, so a real camera clock still matches. RED observed (3 failing cases), then green.
  - `src/shared/db/migrations.pglite.test.ts`: as `app_user` under row-level security (`SET LOCAL ROLE app_user` + `app.handle`), an insert with `happened_time = '18:42'` reads back `18:42:00`; an `UPDATE` of it is refused with `42501` (no UPDATE grant). A characterization test of the existing grant, so no RED.
- 2026-10-02: **T3 done**, commit `d8dbd34` `feat(memories): contribute in three steps with concentric surfaces`.
  - T3 route: delegated writer (2+ non-trivial files).
  - **Tokens.** `globals.css` `:root` defines `--sheet-r: 32px`, `--sheet-pad: 20px`, `--panel-r: calc(sheet-r − sheet-pad)`, `--panel-pad: 4px`, `--inner-r: calc(panel-r − panel-pad)`. `@theme inline` exposes them as `rounded-sheet`, `rounded-panel`, `rounded-inner` and the spacing names `sheet` and `panel` (`p-sheet`, `px-sheet`, `pt-sheet`, `p-panel`, `gap-panel`…). The compiled CSS was checked: each utility resolves to its variable. Shared classes live in `ui/sheet-styles.ts`; no component hard-codes a radius.

    | Surface | Token | px | Why it is concentric |
    |---|---|---|---|
    | Sheet: top corners on phones, all four from `md` | `rounded-t-sheet` / `md:rounded-sheet` | 32 | The outer surface. Its 1 px rim is a shadow ring, so it adds nothing to the box and the padding math stays exact. |
    | Close button, 40 × 40, at 20 px from the top and the right | `rounded-panel` | 12 | 32 − 20: its corner arc has the same centre as the sheet's. |
    | Footer buttons (Atrás, Siguiente, Guardar recuerdo), 48 px, 20 px from the sides and the bottom (+ safe area) | `rounded-panel` | 12 | 32 − 20, nested in the sheet's bottom corners from `md`. |
    | Photo tile and the preview that fills it (clipped, with a 1 px white/10 inset outline) | `rounded-panel` | 12 | Directly in the sheet padding. |
    | Photo remove badge: 32 px, 6 px in from the tile corner, centred in a 44 px hit area | `calc(var(--panel-r) − 6px)` | 6 | Badge rule: panel radius minus its inset. |
    | Audio panel, padded `p-panel` | `rounded-panel` | 12 | Directly in the sheet padding. |
    | Grabar / Subir audio (segmented, `h-11`), Detener, play, Grabar de nuevo, Quitar audio | `rounded-inner` | 8 | 12 − 4: inside the panel padding. |
    | Related chip (`p-panel`, 48 px) and its 40 px remove button | `rounded-panel` / `rounded-inner` | 12 / 8 | Same panel → inner nesting. |
    | Text fields: the words, date, time, Maps link (single-line ones 48 px, like the buttons) | `rounded-panel` | 12 | Directly in the sheet padding; the 1 px border is inside the box. |
    | Swatches, progress segments, drag handle | full | – | Circles and pills: nothing nested. |

  - **Final copy** (neutral Spanish, tú). Kicker "Paso N de 3" (the sheet's only `t-label`, `tabular-nums`); live region "Paso 2 de 3: Cuéntalo"; buttons "Siguiente", "Atrás", "Guardar recuerdo"; close "Cerrar". The dialog keeps its accessible name "Contribuir con un recuerdo" (visually hidden) and has no description: the old paragraph is gone.
    1. **"¿Qué quieres dejar?"** / "Una foto, tu voz o las dos." Related chip "Relacionado con «…»". Photo tile: "Elegir foto" / "JPG, PNG, WEBP o HEIC · hasta 10 MB"; once filled the input is named "Cambiar foto", and the corner button "Quitar foto". Voice: [Grabar | Subir audio]; limits line "Voz hasta 60 min y 100 MB · mejor MP3, M4A u OGG" (adjusted to the real limits: `MAX_AUDIO_MS`, `MAX_AUDIO_BYTES`; every listed format is accepted, more are). Errors: "Agrega una foto o tu voz para seguir.", "Detén la grabación para seguir."
    2. **"Cuéntalo"**. "¿Qué recuerdas?" with the 0/140 counter; "¿Cuándo fue?" with the date and "Hora" in one row and the T2 source hint; "¿Dónde fue?" (was "¿Dónde se sacó?"), idle "Con una foto te sugerimos el lugar.", "Mismo lugar" now under that heading. The consent text, the help line and the before-consent behavior are unchanged.
    3. **"Elige su color"** / "Así brillará en el universo." A 120 px orb preview, the 6 × 44 px swatch grid, then "Lo verás en el universo cuando sea aprobado." at the foot of the step.
  - **Behavior.** All three steps stay mounted, so going back keeps everything (and a playing voice keeps playing); the steps not shown are `hidden`, the one leaving is `inert` + `aria-hidden` until its fade ends. The form's submit is Siguiente on steps 1–2 (Enter in a field included; the textarea keeps Enter as a newline) and saves only on step 3. A double click on Siguiente cannot save: the primary ignores a click with `detail > 1`. Each Siguiente checks only its step (`memory-steps.ts`: `errorsOnStep`, `withoutStep`, `firstInvalid` map the `validateForm` errors to steps); errors sit beside their field with `aria-describedby`, and focus goes to the first one (the audio error to the panel's first control). A Maps link still being read, or not understood, is now a step-2 field error beside the link (it was a form error by the submit); the link field stays while it has text, so it can always be fixed. A failed save stays on step 3; a field the server refused sends the visitor back to its step, focused. Step changes move focus to the step heading (`tabIndex={-1}`, `text-balance`). The upload progress fills the primary button, so the footer never grows.
  - **Motion.** No `motion` dependency, so CSS: the incoming step slides 8 px from its side over 220 ms `cubic-bezier(0.2,0,0,1)` (`@starting-style`), the outgoing one fades 6 px the other way in 150 ms, laid over the new one. Transitions, so they retarget mid-way. Reduced motion: opacity only. Phones: natural height up to 92dvh (the sheet's top moves between steps; the footer does not). From `md`: `w-[min(30rem,calc(100vw-2rem))]`, `h-[min(100%,680px)]` for every step.
  - **T1 advisories resolved.** The note "Los primeros colores salen de tu foto" shows only when a swatch is a photo tone (not a curated hue); with every tone folded into a curated hue the note is empty. Tested in the picker and in the form.
  - **Also fixed.** The selected swatch's ring never showed (its inline glow `box-shadow` overrode the ring); it is now an outline. Buttons take the body face through the `font-gambarino` utility, because the journey's `.ui button { font: inherit }` outranks `.t-body` (found in self-review; that test was written with the fix, so no RED).
  - **Checks against make-interfaces-feel-better.** Concentric radii (table). Optical alignment: play triangle nudged 1 px right; icon-side padding −2 px on Detener. `tabular-nums` on the kicker, the counter, the timers and the dates. Balanced headings, pretty sub-lines and hints. Hit areas: every control ≥ 40 px (close 40, chip remove 40, photo remove 44, audio controls 44, swatches 44, footer 48, checkbox rows 44). Scale 0.96 on press, `transition-[scale,…]`, never `transition: all`. Contrast on `#080714`: ink-muted text about 8.8:1, signal errors about 12:1, the primary's dark text on `#eaf0ff` about 17:1; placeholders moved from ink-faint (about 2:1) to ink-muted.
  - Evidence: RED observed before each step (`memory-steps`: missing module; form model: 2 failing; picker note: 1 failing; `add-memory-steps.test.tsx`: 31 of 31 failing; audio section: 3 failing). `pnpm vitest run src/features/memories src/shared/db`: 97 files, 2404 tests passed. `pnpm test`: 188 files, 3314 tests passed. `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
  - Size: `d8dbd34` is +1763 / −614 lines (+872 / −160 of them tests); the prelude is +26 / −1. This is advisory only: the work unit is one behavior (the stepper and the surfaces it is drawn with).
  - Not verifiable without a browser (for T5): Gambarino's optical vertical centring in the 44 and 48 px controls with `leading-none`; the 12 px formats line in Gambarino; the native date and time inputs at 48 px on iOS; the phone sheet's top edge moving between steps of different heights; browsers without `@starting-style` (older Safari) show the new step without the slide.
- 2026-10-02: **T3 not reviewed, by the user's decision.** The T3 review could not start: `lens_context_budget_exceeded` (23 files, 2,442 lines from `d19ca43`). The user chose to continue without reviewing T3, so the reviewed boundary advances to `03f1d9a` by that decision, not by an approval.
- 2026-10-02: **T4 done**, commit `eebb5d3` `feat(memories): a contribute button that mirrors the way back`.
  - T4 route: delegated writer (2+ non-trivial files).
  - **The control.** `ui/contribute-button.tsx`: `ContributeButton` is the plus mark and the word "Contribuir". It uses `BAR_CONTROL`, the same class set as `BackButton`: `h-(--bar-row)` (48 px), `px-(--bar-pad)` (12 px), `gap-3`, `text-xs`, `tracking-[0.08em]`, inherited Silkscreen, `text-ink-muted`, `.press`. Its focus ring is the shared `.ui button:focus-visible`.
    - The mark sits in the chevron's 14 px box: a 1 px ring (r 6.5) in lavanda `#a39ef9` at 75%, around a 1.5 px square-capped plus in the label's ink. It has a soft glow with no offset: `drop-shadow(0 0 4px #a39ef980)`.
    - There is no border, radius, backdrop or `t-label`. The accessible name stays "Contribuir", with `data-cursor-label`. As `Dialog.Trigger asChild` it gets `aria-haspopup="dialog"` and `aria-expanded`, because it spreads every prop and ref it is given (React 19).
    - Both the AddMemory trigger and the glass view's Contribuir use it, and the glass still hands over the open memory.
  - **Geometry at the source.** Tailwind only sees literal classes, so the numbers became tokens in `globals.css` `:root`. They follow the T3 token pattern.
    - Phone values: `--bar-y` 1rem, `--bar-x` 0.5rem, `--bar-notch` 0.25rem. Inside `@variant md` they become 1.75rem, 2.25rem and 0.5rem. The production build flattens this to `@media (min-width:48rem){:root{…}}`.
    - `--bar-top` is `max(--bar-y, env(top) + notch)`. `--bar-left` and `--bar-right` use the same expression, each against its own inset, so the sides mirror by construction.
    - The other tokens: `--bar-row` 3rem, `--bar-pad` 0.75rem, `--bar-ink` 3px (the chevron tip is at x 4, less a miter of 1.06), `--bar-gap` 0px (the row's own 16 px under its label already separates them) and `--title-bearing` 0.02em.
    - `top-bar.ts` exports `BAR_TOP` `top-(--bar-top)`, `BAR_LEFT`, `BAR_RIGHT`, `BAR_CONTROL` and `BAR_TITLE`. `BAR_TITLE` is `top: calc(bar-top + bar-row + bar-gap)` and `left: calc(bar-left + bar-pad + bar-ink − title-bearing)`. No class spells out a rem or an `env()`.
  - **Mirrored numbers** (no safe-area insets; the left side's computed values did not change):

    | | Phone (< 768 px) | md (≥ 768 px) |
    |---|---|---|
    | Bar top | 16 | 28 |
    | Left box inset (back) | 8 | 36 |
    | Right box inset (Contribuir) | 8 (was 12) | 36 |
    | Back chevron ink from the left edge | 8 + 12 + 2.94 ≈ 23 | ≈ 51 |
    | Contribuir label ink from the right edge | 8 + 12 + trailing tracking 0.96 + Silkscreen side bearing ≈ 22–23 | ≈ 50–51 |
    | "Recuerdos" top | 16 + 48 + 0 = 64 (was 60) | 28 + 48 + 0 = 76 (was 68) |
    | "Recuerdos" box left | 23 − 0.4 ≈ 22.6 (was 20) | 51 − 0.45 ≈ 50.6 (was 48) |

  - **Same row and timing.** Both are `h-(--bar-row) items-center` at `BAR_TOP`.
    - The Contribuir slot (`data-hud`) is now mounted with a visitor's space, empty while the memories load. Its `rise` wrapper therefore starts with the way back's, and the two arrive together whenever the load finishes within the rise's 360 ms delay.
    - The rise sits on an inner wrapper, because an animation's filled opacity would outrank the slot's covered fade under the glass. A guest gets no slot.
    - Reduced motion: `.rise` falls back to the shared fade.
  - **Also aligned.** In the glass view, Cerrar (the right end) and a guest's Universo use `BAR_CONTROL`. On phones the glass's right-hand row therefore moves 4 px toward the edge, mirroring Universo. The facet place and entry screens use `BackButton` and are unchanged: same computed insets, same box.
  - Choice: the mark stays leading ("⊕ Contribuir"), so the right edge that mirrors the chevron is the label's last letter, not the mark. A trailing mark would put two icons at the outer edges, but would read "Contribuir ⊕".
  - Evidence: RED observed before each step. `top-bar.test.ts`: 8 of 8 failing. `contribute-button.test.tsx`: missing module. Integration: 11 failing across `mobile-layout`, `memories-place`, `glass-view` and `add-memory`.
    - The compiled CSS was checked with `@tailwindcss/postcss` in production mode: every `--bar-*` utility resolves to its variable.
    - `pnpm vitest run src/features/journey src/features/memories src/shared/lib`: 105 files, 2410 tests passed.
    - `pnpm test`: 189 files, 3337 tests passed.
    - `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
  - Size: +418 / −80 (+298 / −30 of them tests).
  - Not verifiable without a browser (for T5):
    - Silkscreen's trailing side bearing, and whether the trailing letter-spacing is painted. Together they decide whether the label's right ink lands within about 1 px of the chevron's 23 / 51 px.
    - Gambarino's real "R" side bearing (0.02em is an estimate).
    - Whether the 14 px ring reads at the chevron's optical weight.
    - The glow's strength on the void.
    - The 4 / 8 px lower "Recuerdos" on phone and md.
    - A slow load: the control appears mid-rise, or after it.
- 2026-10-02: **T4 reviewed.** T4 review `review-9a94c900e9410115` approved and acknowledged, reviewed boundary `e2aaf8d`; its one advisory (md tokens compile) was proven in Chromium: `--bar-y` 1.75rem / `--bar-x` 2.25rem at 1440.
- 2026-10-02: **T5 visual check (Playwright, real Chromium).** Every target PASS at 390, 360 and 1440 px.
  - Header mirror: off by 0.95 px before the polish below ("Contribuir" ink 21.98 px from the right, the chevron's 22.94 px from the left). Title vs chevron ≤ 0.4 px.
  - Concentric pairs: close 12 = 32 − 20; footer 12; badge 6 = 12 − 6; audio controls 8 = 12 − 4.
  - Text centering ≤ 1 px. Smallest hit area 40 × 40. Contrast ≥ 8.77:1.
  - Polish findings: the phone sheet's top edge jumped between steps (1→2: 190 px at 390, 128 at 360; 2→3: back 106 / 44); the last swatch row hugged the left; the 0.95 px mirror; the sheet opened on Cerrar; the place's status and help line in the no-location state.
- 2026-10-02: **T5a polish done**, commit `57e750a` `fix(memories): steady sheet, centered swatches and a true mirror`.
  - T5a route: delegated writer (4 files).
  1. **Steady sheet.** Rule: one height for every step, the desktop's 680 px, which holds the tallest step (Cuéntalo, about 650 px at 390 wide from the measured deltas). Phones: `h-[min(92dvh,calc(100%-max(0.5rem,env(safe-area-inset-top))),680px)]`, so it never passes 92dvh nor the top safe area and still shrinks above the keyboard (the `100%` is the content box the keyboard inset pads). From md: `md:h-[min(100%,680px)]` as before; `max-h` is gone. A shorter step stays top-aligned, a longer one scrolls in the body, the footer stays pinned with its safe-area padding.
  2. **Centered swatches.** The row is `flex w-full max-w-[17.125rem] flex-wrap justify-center gap-0.5` (6 × 2.75rem + 5 × 0.125rem = 274 px), for the swatches and the empty slots. 14 swatches lay out 6, 6, then 2 in the middle. 44 px cells, DOM order and the index-based keys are unchanged.
  3. **True mirror.** `pr-px` on the word inside `ContributeButton`, with a comment on the optical reason (Silkscreen's trailing side bearing vs the chevron's square-cap overhang). It sits on the word rather than the button so the box keeps `BAR_CONTROL` exactly, which `mobile-layout.test.tsx` and `contribute-button.test.tsx` pin as equal to the way back's; the painted result is the same 1 px. `top-bar.ts` is unchanged.
  4. **Initial focus.** `onOpenAutoFocus` prevents Radix's default (Cerrar) and focuses step 1's heading (`data-step-heading`), the way every step change does.
  5. **Place copy and hierarchy.** The status line is a plain hint while there is no place (no photo, reading it, no location); a place keeps the fields' ink. The help line shows only while there is a place to keep (the photo's, before or after the consent, or a resolved link), and says only what the place is for: "El lugar sirve para ubicar tu recuerdo en el universo." The consent still says what is kept and who sees it, so "saving" is said once. No dangling `aria-describedby`. Consent, privacy and what is saved are unchanged.
  - Compiled CSS checked with `@tailwindcss/postcss`: the phone and md heights and `max-w-[17.125rem]` resolve to the intended declarations.
  - Evidence: RED observed first (16 failing across the six test files), then green. `pnpm vitest run src/features/memories`: 94 files, 2310 tests passed. `pnpm test`: 3354 passed, 1 failed, the known flaky `memories-place.test.tsx` "restores the camera exactly under reduced motion", which passed alone. `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
  - **Sheet height, corrected by the parent (`829f718`).** A 680 px cap would make Cuéntalo scroll: Chromium measured it at 744 px tall at 390 px wide (`out-p390.json`, natural height). The cap is now 760 px on phones, still `min` with 92dvh and the top safe area. From md it is `min(100% - 2rem, 760px)`, so the tallest step fits and the dialog stays 1 rem clear of a 1280x720 screen.
    - Evidence: RED first on the class test, then `pnpm vitest run src/features/memories` 94 files / 2310 passed, `pnpm lint` 0, `pnpm typecheck` 0.
    - Route: inline (one mechanical file plus its test).
- 2026-10-02: **Delivered** with the user's authorization ("Si, vos aplica y pushea a main, sin problemas").
  - RDD on the last slice (`57e750a`, `447da3c`, `829f718` from `e2aaf8d`): assessed medium, `review_due` false, `under_budget`. It went out unreviewed under ordinary policy.
  - `prisma migrate status` listed `20261007000000_memory_happened_time` as the only pending migration. `prisma migrate deploy` (owner role) applied it, before the push, because the new code reads the column.
  - Read-only checks as the owner on Neon:
    - `happened_time` is `time without time zone`, nullable.
    - `app_user` has INSERT and SELECT on it and no UPDATE.
    - `memories` keeps RLS enabled and forced.
    - There are 5 existing rows, none with a time.
  - `main` fast-forwarded to the feature branch and pushed.

## Follow-ups

- ~~`create-memory.ts` still stores `DEFAULT_ORB_COLOR` (`#8ab4ff`) when a memory has no pick and no dominant color.~~ **Resolved in T2 (`e1f940d`):** it stores `null`, and the read path gives the curated hue of the id.
- `src/types/exifr-lite.d.ts` (outside the T2 surface) still declares only `gps` and says only the GPS reader is used. `photo-exif.ts` augments the module with `parse`. Move that declaration into the `.d.ts` and drop the unused `gps` declaration.
- ~~Optional: a PGlite test that app_user can insert `happened_time`.~~ **Resolved in the T3 prelude (`2f80414`).**
- `ui/memories-space.tsx` (outside the T4 surface) still calls the control "the pill in the top bar" in the `ContributeState` comment.
- Place copy: before the consent no place is shown, yet the link's label already asks "¿No fue ahí?". Use "Si quieres, pega un link de Google Maps" until a place is on screen (tests in `add-memory.test.tsx` pin the current label).

## Next step

Delivered. The follow-ups above are optional polish for a later pass.
