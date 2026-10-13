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

## Slice 05 — Choose a style and preview the first draft

- Status: VERIFIED
- Build: existing style picker writes `themeKey` and applies it to the saved TimelineContract. The cinema page plays that contract.
- Browser: reopened “Film Two”, chose Joyful, reload kept Joyful selected and Timeless unselected, `/film` showed “YOUR FILM IS READY” for that tribute. No page errors.

## Slice 07 — Edit words, undo, render again

- Status: VERIFIED
- Browser: on `/film/edit`, saved the caption “A quiet garden”, reloaded and the caption was still there, lengthened the moment, undid that length change, reloaded with the caption intact, then enqueued another preview. Worker reached `preview · READY · verified · poster · current · v6`.
- Known: the simple editor changes caption, duration, and transition. Scene reorder lives outside this pass.

## Slice 06 — Two songs, trim, fade, mix

- Status: VERIFIED
- Build: two rights-confirmed personal songs become AudioMix clips in different sections, with trim (`durationFrames`), fade, and gain. A spoken video scene adds a speech clip and a ducking region. Songs are not photo scenes. The encoder reads `/api/media` originals. Licensed masters remain XB-002.
- Tests: `corepack pnpm exec vitest run src/server/personal-songs.test.ts src/server/timeline.test.ts` — 5 passed. The later song is about 18 dB quieter in the rendered MP4 (`mean_volume` windows). Same start frame is rejected.
- Browser: “Film Two” uploaded `opening-hymn.wav` and `later-waltz.wav` with rights confirmed, placed both from Guided Audio, reload showed “2 songs on the timeline”, and the next preview reached `READY · verified` (v7).

## Slice 08 — Local pack, entitlement, export

- Status: VERIFIED locally. Live Stripe remains XB-005 and is not called paid COMPLETE.
- Build: Memorial Pack entitlement still comes from `local_fake` in this environment. A final render and MP4 download stay behind that entitlement. Stripe webhook fulfillment is implemented and tested with a mock secret; duplicate delivery does not grant twice.
- Tests: `corepack pnpm exec vitest run src/server/stripe-checkout.test.ts` — included in the 8 passed with story and shares. Duplicate webhook returns `duplicate: true`. `local_fake` fulfill does not claim a Stripe source.
- Browser: “Film Two” showed “Memorial Pack is active · private playback · ceremony download” after Activate Memorial Pack (local). Enqueue final and advance worker, then download returned 200 (270026 bytes). ffprobe: H.264 1920×1080 and AAC. Screenshot `/opt/cursor/artifacts/slice08-local-pack.png`.
- Known: no live Stripe keys. Client cannot start a paid Checkout Session here (`stripe_not_configured`).

## Slice 09 — Private share, then revoke

- Status: VERIFIED
- Build: private watch links store a token hash only. Create stays disabled until the pack entitlement is active. Revoke makes the same token fail.
- Tests: `src/server/shares-local.test.ts` — create requires pack and a timeline, the stored JSON does not contain the token, and redeem after revoke returns `revoked`.
- Browser: a fresh page opened the Film Two watch link and showed the private screening. After Revoke, a new page showed “This private viewing link was revoked.” Screenshot `/opt/cursor/artifacts/slice09-revoked.png`. The token was not written into this ledger.

## Slice 10 — Chapters and local restoration, without invented biography

- Status: VERIFIED for the safe local path. Voice cloning stays blocked (XB-009) and was not implemented. Generative story writing and generative enhancement are not marked complete.
- Build: chapters are grouped only from ready memories and the years the family supplied. `ensureStoryChapters` leaves an existing chapter list alone, so a renamed title survives a later page load. Local enhancement requires consent and its note says it is not COMPLETE.
- Tests: `src/server/story-enhance.test.ts` — derived chapters keep only supplied memory ids; renaming the first chapter to “Family supplied chapter” survives `ensureStoryChapters`; enhancement without consent is denied.
- Browser: on `/life-story` for Film Two, the first chapter was renamed to “Family supplied chapter”, “Chapter titles saved.” appeared, and reload kept that title. Screenshot `/opt/cursor/artifacts/slice10-chapter.png`.

## Slice 11 — Professional workspaces and white-label

- Status: NOT STARTED. The masterplan marks this post-beta or separately gated (M11). This app has no organization, delegated-user, or white-label model. A tenant system was not added in this pass.
- Not a missing credential. Do not treat this as blocking slices that already have a local path.

## Slice 12 — Launch languages, support, operations

- Status: PARTIAL. Release gate is not green.
- Build: auth, navigation, Memorial Pack, share, and music catalog strings exist for en, nl, de, fr, es, pt, it, pl. `locale-pack` test rejects a missing or raw key. Account deletion removes the local tribute.
- Tests: `src/server/locale-pack.test.ts` covers every `CREATOR_UI_KEYS` entry in all eight languages (run earlier in the suite; key coverage is the assertion in that file).
- Browser: Language select `nl` on `/share` showed “Herdenkingspakket” and Dutch navigation. Screenshot `/opt/cursor/artifacts/slice12-nl-share.png`. A separate account deleted “Delete Me” and the account page showed “Tribute deleted from local storage.” and “No tributes yet.”
- Not met: memories, life story, the film editor, guest upload, and personal-song placement are still hardcoded English. Checkout in each language needs live Stripe (XB-005). Native copy review remains open. Production alerting and a hosted backup restore are not configured. Auto-deploy stays off.

## Still external

- XB-002 licensed masters
- XB-005 live Stripe
- XB-009 voice (do not implement)
- XB-012 hosted Supabase / database credentials
- Production deploy stays unauthorized; Vercel auto-deploy stays off
