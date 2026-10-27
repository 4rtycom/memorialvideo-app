# Functional audit

**Date:** 2026-10-13  
**Audited tree:** `memorialvideo-app` `main` at `14ad51e` (public app mirror of creator UI).  
**Spec:** `docs/implementation/MemorialVideo-Full-Stack-Implementation-Masterplan-v1.0.md` (store copy).

## Repository conflict

The masterplan names repository `C:\dev\memorialvideo`. In this workspace that repo is the marketing site plus the older product monorepo. The application Glenn runs is `memorialvideo-app` (`https://memorialvideo-app.vercel.app/`). Marketing pages in `memorialvideo` were left unchanged. Implementation of this spec lands in `memorialvideo-app`.

## What is real today

| Area | State | Evidence |
|---|---|---|
| Visual app shell, routes, eight-language catalogs | WORKING as UI | `src/app/*`, `src/lib/creator-ui-messages.ts` |
| Tribute document, timeline, invites, shares, local render jobs | PARTIAL | `src/server/store.ts` persisted to `.data/creator-store.json` or Vercel KV |
| Password accounts, owner isolation, reload | WORKING after slice 01 | `src/server/accounts.ts`, `src/server/account-access.test.ts`, Chrome walk |
| PostgreSQL document store | WORKING when `DATABASE_URL` or a SQL driver is present | `src/server/sql-store.ts`, `src/server/sql-store.test.ts` (PGlite) |
| Supabase magic link | PARTIAL | `src/app/api/auth/request-link/route.ts` only if public Supabase env exists |
| Hosted Supabase / service-role without `DATABASE_URL` | BLOCKED | Persistence reports `database_preferred_unwired` (XB-012) |
| Photo/video/song bytes | PARTIAL | Local ingest and encode. Originals are not a private object bucket. HEIC rejected. |
| Guest invites | PARTIAL | Hash-only tokens in the local document. Not proven against hosted storage. |
| Stripe | PARTIAL | Checkout session + webhook code. Live secrets are XB-005. Local fulfill is `local_fake`. |
| Licensed music | BLOCKED | Synthetic `development_only` catalog. XB-002. |
| Voice cloning | BLOCKED | XB-009. Not implemented. |
| Render | PARTIAL | Local Remotion/ffmpeg worker. Not a durable hosted queue. Four encode tests fail in this standalone checkout because they look for `../video` fixtures (`packages/video` is the real path). |
| Marketing site | WORKING elsewhere | `memorialvideo` repo. Not modified. |

## Mocked or local-only behavior that must not be called production-complete

- `POST /api/checkout/local-fulfill` grants Memorial Pack only when `APP_ENV=local`, source `local_fake`.
- `POST /api/dev/seed-eleanor` fixture seed.
- Unsigned local mode can still create tributes when `APP_ENV=local` and no session cookie is present. Signed-in and non-local requests are owner-scoped.
- Single JSON/SQL document is not per-row RLS for each tribute. Table RLS denies roles without `GRANT`. Owner checks are application-side.
