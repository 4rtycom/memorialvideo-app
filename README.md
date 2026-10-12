# `@memorialvideo/creator`

Visual source of truth for **https://memorialvideo-app.vercel.app/** (Figma Page 02 AppShell).

Restored from the store archive (`archives/creator-memorialvideo-app.tgz` / `artifacts/`). Production behavior is wired through monorepo packages (`@memorialvideo/domain`, `@memorialvideo/config`) with **local file persistence** when the FS is writable, optional **Vercel KV** when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set, and honest **503 `persistence_unavailable`** on serverless hosts without a durable backend (no invented DB secrets; Supabase document adapter still XB-012).

## Commands

```bash
corepack pnpm --filter @memorialvideo/creator dev      # http://127.0.0.1:3002
corepack pnpm --filter @memorialvideo/creator test
corepack pnpm --filter @memorialvideo/creator typecheck
```

Or from repo root: `corepack pnpm dev:creator`.

## Local persistence

- Store: `apps/creator/.data/creator-store.json` (gitignored)
- Active tribute cookie: `mv_creator_tribute` (httpOnly)
- Eleanor only via `POST /api/dev/seed-eleanor` when `APP_ENV=local`
- Memorial Pack local fulfill: `POST /api/checkout/local-fulfill` (`APP_ENV=local` only)

## Deploy note

Do **not** deploy or push unless Glenn asks. When authorized, point Vercel project `memorialvideo-app` Root Directory at `apps/creator` in this monorepo (or a dedicated repo that preserves this UI).
