# Production readiness

Paid beta is **not** ready. Slices 01–10 have a verified local path. Slice 11 is post-beta. Slice 12 is partial. Live payment, hosted storage, licensed masters, and voice are still open.

| Gate | State |
|---|---|
| New account can create a memorial and see it after reload | Met locally |
| Another account cannot read that memorial | Met locally and in unit tests |
| Private object storage for originals | Not met |
| Hosted Postgres credentials | Not present here. Code path is `DATABASE_URL`. |
| Stripe live payment | Not met (XB-005). Local fulfill remains `local_fake`. |
| Background 1080p worker off the request | Local encode exists. Hosted queue is not configured. |
| Licensed music | Not met (XB-002) |
| Production deploy | Not performed. Vercel auto-deploy stays off. |

## Operate locally

```text
corepack pnpm dev
```

Open `http://127.0.0.1:3000/sign-in`. Create an account (10+ character password), then `/setup`.

For Postgres, set `DATABASE_URL` to a non-superuser role that is a member of `creator_app` after the table policy is created. Superusers bypass row-level security.

Set `CREATOR_SESSION_SECRET` (at least 16 characters) outside local development.

## Local recovery

Stuck preview or final jobs advance with `POST /api/worker/render-once` while the dev server is running. Final download stays closed until a verified READY job and a Memorial Pack entitlement exist. A revoked private link must fail on the next watch open. Account deletion removes that tribute from the local store. Do not treat `local_fake` pack activation as a paid Stripe charge. Voice recreation stays off.
