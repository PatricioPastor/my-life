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
- [ ] **T3 Stepper:** three steps, concentric radius tokens, copy rewrite, single column, focus and announcements, tests updated. Route: delegated writer.
- [ ] **T4 Header:** Contribuir redesign and alignment, "Recuerdos" alignment, shared with the glass view. Route: delegated writer.
- [ ] **T5 Verify and deliver:** browser screenshots at 390 px and desktop, design detector, full test/lint/typecheck. Apply the migration with authorization, then fast-forward `main` after approval.

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

## Follow-ups

- ~~`create-memory.ts` still stores `DEFAULT_ORB_COLOR` (`#8ab4ff`) when a memory has no pick and no dominant color.~~ **Resolved in T2 (`e1f940d`):** it stores `null`, and the read path gives the curated hue of the id.
- `src/types/exifr-lite.d.ts` (outside the T2 surface) still declares only `gps` and says only the GPS reader is used. `photo-exif.ts` augments the module with `parse`. Move that declaration into the `.d.ts` and drop the unused `gps` declaration.
- Optional: a PGlite test that app_user can insert `happened_time` (`src/shared/db/migrations.pglite.test.ts`, outside the T2 surface). The migration already runs there.

## Next step

T3 stepper (fold in the T1 review advisories above).
