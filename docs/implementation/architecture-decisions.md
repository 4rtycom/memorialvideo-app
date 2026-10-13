# Architecture decisions

## AD-1 — Implement in memorialvideo-app

The masterplan’s path `C:\dev\memorialvideo` does not match the split deployment. `memorialvideo` is the marketing project. `memorialvideo-app` is the creator UI Glenn uses. Product work stays in the app repo so marketing is unchanged.

## AD-2 — Keep the document store, add an owner and a Postgres writer

The creator already persists one versioned document (`creator-store` v5). Slice 01 adds `accounts` and `ownerAccountId` instead of replacing the tribute model. When `DATABASE_URL` is set, that document is read and written in PostgreSQL table `creator_store`. Local files remain the default when no database URL is set, so existing tests keep a writable disk.

## AD-3 — Application owner checks plus table RLS

Signed-in requests run inside an account id. Reads hide other tributes. Writes merge so an account cannot delete another account’s tributes. The SQL table enables and forces row-level security and grants access only to role `creator_app`. A role without that grant cannot select the document (PGlite test). This is not yet one row per tribute.

## AD-4 — Password sessions without logging email

Passwords are scrypt hashes. Lookup uses SHA-256 of the normalized email. The session cookie is HMAC-SHA256 with `CREATOR_SESSION_SECRET`, or a local `.data/session-secret` when `APP_ENV=local`. Non-local hosts without that secret return `auth_not_configured`. Supabase magic link remains available when its public env is set.
