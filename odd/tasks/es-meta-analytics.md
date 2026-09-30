# Spanish, metadata, security, analytics and star visibility

- **Locator:** `odd/tasks/es-meta-analytics.md` in `github.com/PatricioPastor/my-life`
- **Engram mirror:** topic `odd/es-meta-analytics/tasks` (project `theduck`)
- **Branch:** `feat/es-meta-analytics` from `main` @ `a22a2c5`

## Objective

The user asked for these changes:

- the whole page in Spanish;
- metadata;
- `security.txt`;
- Vercel and Google analytics, plus "everything you think is necessary";
- the name placeholder replaced with `patriciopastor`;
- more visible stars, since today they look washed out ("quemadas") over the gas.

## Decisions

- **Copy.** Neutral Spanish with `tú`, as the persona rules require for explicitly requested Spanish artifacts; the user can switch to voseo later.
  - Facets: Historias, Escritos, Proyectos, Ahora.
  - Name mark and site title: `patriciopastor`.
  - `<html lang="es">`.
  - Handles are never translated.
- **Metadata.**
  - Title and description.
  - `metadataBase` from `NEXT_PUBLIC_SITE_URL`, falling back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, then to localhost.
  - Open Graph and Twitter card with a generated OG image (`opengraph-image.tsx`, ember palette).
  - A generated icon, and `viewport.themeColor` `#0A0600`.
  - Robots stay `noindex, nofollow`, because the site is invitation-only.
- **`security.txt`** (RFC 9116), served at `/.well-known/security.txt` by a route handler:
  - `Contact: https://ig.me/m/patriciopastor_` (no email is used without the user's say-so);
  - `Expires` under one year;
  - `Preferred-Languages: es, en`;
  - `Canonical` built from the site URL.
- **Security headers** in `next.config.ts`:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy` denying camera, microphone and geolocation
  - A CSP is deferred: a strict one needs nonces and dynamic rendering, and a loose one adds little.
- **Analytics.**
  - `@vercel/analytics` and `@vercel/speed-insights`.
  - Google Analytics 4 via `@next/third-parties`, rendered only when `NEXT_PUBLIC_GA_ID` is set.
  - A small `track(event, props)` port in `src/shared/analytics` fans out to both providers.
  - Journey events: gate submitted, granted, denied, access request clicked, facet opened, entry opened.
  - **No Instagram handle or other PII is ever sent to analytics.**
- **Star visibility.**
  - Invert the gas boost around sparkles: carve a dark halo so the stars pop.
  - Porcelain white cores with facet-colored spikes.
  - Slightly lower gas intensity.
  - Verify with screenshots.

## Constraints

- Public repo: `.env.local` stays untouched and uncommitted. `.env.example` documents the new variables.
- Conventional Commits with no AI attribution. Push and merge only after the user approves.
- Code and comments in English; UI copy in Spanish.

## TDD

- **Mode:** strict (global `CLAUDE.md`).
- **Runner:** `pnpm test`.
- Pure logic is test-first: the site URL resolution, the `security.txt` body builder, the analytics event mapping with its no-PII guarantee, the facet names, and the gate copy.

## Tasks

- [x] **T1 — Spanish and metadata.** Copy, name mark, `lang`, metadata, OG image, icon, theme color, `.env.example`.
- [x] **T2 — Security.** The `security.txt` route handler and security headers.
- [x] **T3 — Analytics.** Vercel Analytics, Speed Insights, env-gated GA4, the `track` port and journey events.
- [x] **T4 — Star visibility.** Shader and params changes, plus screenshots.

## Acceptance criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- No English UI copy remains in the default experience.
- `/.well-known/security.txt` returns `text/plain` with the required fields.
- Analytics render in production without breaking the static home. GA is absent when the ID is unset. Tracked events never include handles.
- Stars stand out clearly over dense gas in screenshots.

## Progress

- 2026-09-30: Document created.
- 2026-09-30: T1 done. Spanish copy, name mark, metadata, generated OG image and icon, `.env.example`. Route: delegated writer. RED: 22 failing tests before implementation; GREEN: 194 passing.
- 2026-09-30: T2 done. Static security.txt route and four security headers. RED: missing modules; GREEN: 199 passing, build lists the route.
- 2026-09-30: T3 done. Allow-listed `track` port, Vercel Analytics, Speed Insights, env-gated GA4, journey wiring. RED: missing modules and 2 failing journey tests; GREEN: 209 passing, `/` still static.
- 2026-09-30: T4 done. Dark halo replaces the additive gas boost, porcelain cores, stronger anchors, ember threshold 0.6 and density 0.46. Verified with 1440x900 and 390x844 screenshots. Final: lint, typecheck, 213 tests, build all pass.

## Next step

T1–T4 done; awaiting user review before any push.
