# Render worker

Renders the memorial film outside Vercel. Runs **exactly one instance** (there is no job claim lock yet).

## What it does
1. Reads the store (same KV/persistence as the app) for jobs in `QUEUED`, active, or `FAILED_RETRYABLE`.
2. Downloads the memories from Supabase Storage (`memories` bucket) into `.data/media`.
3. Runs the existing render pipeline (`advanceRenderOnce`, ffmpeg + Output QC).
4. Uploads the MP4 and poster to the `renders` bucket, then the job is `READY`.
5. Retries automatically (max 3 attempts), then reports to `ERROR_WEBHOOK_URL`.

## Environment (same values as the Vercel project)
| Variable | Purpose |
| --- | --- |
| `APP_ENV=production` | hosted mode |
| store/KV variables | identical to the app, so both see the same tributes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only key, never expose |
| `SUPABASE_MEDIA_BUCKET` / `SUPABASE_RENDER_BUCKET` | optional, defaults `memories` / `renders` |
| `ERROR_WEBHOOK_URL` | optional failure alerts |
| `RENDER_WORKER_POLL_MS` | optional, default 5000 |

## Run
- Locally: `pnpm worker:render`
- Container: `docker build -f worker/Dockerfile -t memorialvideo-render-worker .` then run with the variables above.
- Hosting: Fly.io, Railway or Cloud Run (min instances = 1, 2 vCPU, 4 GB RAM, 10 GB disk is plenty for a beta).

## Known limits
- App and worker both read-modify-write the single store document; acceptable for beta, move jobs to Postgres later.
- Enhancement variants are not built in hosted mode yet. The venue pack is built by the worker after each final film (films made before this change have no pack).
