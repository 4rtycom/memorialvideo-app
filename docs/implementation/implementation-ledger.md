# Implementation ledger

Statuses: `TODO` | `IN_PROGRESS` | `VERIFIED` | `BLOCKED`

Spec slices from the masterplan. Ticket IDs in `memorialvideo/docs/AUTONOMOUS_BUILD_LEDGER.md` stay the historical monorepo ledger. This file is the creator-app execution board.

## Slice 00 — Audit

- Status: VERIFIED
- Evidence: `docs/implementation/functional-audit.md`
- Conflict: spec path `C:\dev\memorialvideo` vs live app repo `memorialvideo-app`. Marketing repo not modified.

## Slice 01 — Sign in, create project, reload, deny other user

- Status: VERIFIED
- Build: scrypt password accounts (email stored only as SHA-256), HMAC session cookie, owner id on tributes, merge-on-write so one account cannot replace another’s tribute, PostgreSQL document when `DATABASE_URL` is set.
- Tests: `corepack pnpm exec vitest run src/server/account-access.test.ts src/server/sql-store.test.ts src/server/persistence.test.ts src/server/store.test.ts src/server/locale-pack.test.ts` — 20 passed.
- Browser: Chrome on `http://127.0.0.1:3000`. Create account `ida.browser@example.com`, create “Ida Browser”, reload workspace, home still shows the name, sign out, second account does not see that tribute.
- Media bytes: `GET /api/media/...` returns the file to the owning session and 404 to another account (`src/server/media-auth.test.ts`).
- Not done: hosted Supabase project is not connected in this environment. Magic link stays unused until `NEXT_PUBLIC_SUPABASE_URL` and anon key exist.

## Slice 02 — Upload photo, video, song into the library

- Status: TODO
- Existing: local ingest state machine and file paths. Missing: private bucket, signed upload, song+video fixture that survives as stored objects.

## Slices 03–12

- Status: TODO
- Blocked external items remain XB-002 licensed masters, XB-005 live Stripe, XB-009 voice, hosted database credentials, production deploy (auto-deploy stays off).
