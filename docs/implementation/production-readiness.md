# Production readiness

Paid beta is **not** ready. Slice 01 is the first verified persistence slice.

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
