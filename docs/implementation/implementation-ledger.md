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

- Status: VERIFIED
- Build: owner and guest authorize write a private local object (`/api/media/{tribute}/{asset}`), TUS PATCH is limited to the active tribute or a redeemed guest invite, complete sniffs JPEG/PNG/WebP/WAV/MP3/MP4 bytes, stores SHA-256, and deletes a mismatch. Personal songs require `musicRightsConfirmed`. HEIC stays rejected with no conversion. Library cards render songs and videos without treating them as photos.
- Tests: `corepack pnpm exec vitest run src/server/upload-flow.test.ts src/server/media-storage.test.ts src/server/media-auth.test.ts src/server/store.test.ts` — 13 passed (jpeg checksum and private path, PDF-as-jpeg 415 with bytes deleted, wav rights gate, other account media GET and TUS PATCH 404).
- Browser: Chrome on `http://127.0.0.1:3000`. Account `nora2.upload@example.com` created “Nora Two”, uploaded `family-song.wav` (rights checked) and `garden.png`, reload kept both on `/memories`. Owner `GET /api/media/mv_dbc9071389c34a6a/mem_d0aa9dfbdb3db83e` returned 200 (70 PNG bytes). Second account `owen2.upload@example.com` received 404.
- Known gap: hosted Supabase Storage is not connected (XB-012). Bytes live under `.data/media` and are served only by the owner-checked route. The 30-photo/5-video/2-song bulk fixture was not replayed as one browser session. HEIC is rejected, not converted.

## Slice 03 — Guest invite, submit, owner approve

- Status: VERIFIED
- Build: existing hashed invite, guest session, and review routes now carry a real private upload. A guest without an account stores JPEG bytes, cannot read another memorial’s media (403), and a revoked or expired token cannot be redeemed. The owner accepts the memory; another account cannot.
- Tests: `corepack pnpm exec vitest run src/server/guest-upload.test.ts` — 2 passed.
- Browser: Chrome owner `lea3.guest@example.com` created “Lea Three” and an invitation. A second browser uploaded `visit.png` as Sam and saw “Your memory has been received.” Guest fetch of the private media URL returned 403. Owner clicked “Add to film” and saw Accepted. After Revoke, a fresh browser showed “This invitation was revoked.”
- Known: invitation links use `NEXT_PUBLIC_APP_URL`, which defaults to port 3002. The local dev server in this environment is port 3000, so the browser check rewrote the host. Email delivery of invites is not configured.

## Slice 04 — One playable film from persisted photos

- Status: VERIFIED
- Build: local encoder fixture root is `packages/video` (this app is not beside a `video` package). Preview jobs encode the saved TimelineContract with ffmpeg by default.
- Tests: `corepack pnpm exec vitest run src/server/local-encode.test.ts` — 19 passed, including a 1080p H.264/AAC QC file.
- Browser: account `film2.encode@example.com` uploaded three PNGs, arranged the first film, enqueued a preview, and advanced the worker to `preview · READY · verified`. ffprobe on the output: H.264 1920×1080, AAC, duration 20.5s, 330858 bytes.
- Known: Remotion is opt-in (`CREATOR_USE_REMOTION=1`). This verified file is the default ffmpeg slideshow. Hosted render queue is not connected.

## Slices 05–12

- Status: TODO
- Blocked external items remain XB-002 licensed masters, XB-005 live Stripe, XB-009 voice, hosted database credentials, production deploy (auto-deploy stays off).
