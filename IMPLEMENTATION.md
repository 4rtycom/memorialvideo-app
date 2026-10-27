# Implementation — Figma Page 02 (apps/creator)

Source: [MemorialVideo — Marketing Website ONLY | Cinema of a Life — 2026](https://www.figma.com/design/mGHibVw3IM5Sy4pLEHDHkP/MemorialVideo-%25E2%2580%2594-Marketing-Website-ONLY-%257C-Cinema-of-a-Life-%25E2%2580%2594-2026?node-id=59-13)  
`fileKey`: `mGHibVw3IM5Sy4pLEHDHkP` · Page node `59:13`

## Implemented (navigable UI + local behavior)

| Figma frame | Route | Status |
| --- | --- | --- |
| 01 Owner / My tributes & resume | `/` · `/account` | Local tribute list/open/delete |
| 02 Setup / Begin a memorial film | `/setup` | Implemented |
| 03 Workspace / Guided overview | `/workspace` | Implemented |
| 04 Memories / Library & upload | `/memories` | Local TUS + ingest + filters; People consent + manual labels (detection not COMPLETE) |
| 05 Contributors / Invite loved ones | `/contributors` | Hash-only invites; expiry labeled; collection lock/open; collab inbox + placement confirm→patch |
| 06 Contributors / Incoming memory review | `/contributors/review` | Implemented |
| 07 Life Story / Suggested chapters | `/life-story` | Local chapters; generative AI not COMPLETE |
| 08 Film styles / Choose atmosphere | `/film/styles` | Theme sync onto TimelineContract |
| 09 Film creation / Calm progress | `/film/creating` | Stage machine → TimelineContract |
| 10 Cinema / Private film screening | `/film` | Remotion player when Chrome present |
| 11 Edit / Simple story director | `/film/edit` | Guided edits + autosave conflict + Guided Audio (TTS blocked) + Guided Variants |
| 12 Music & words / Personal touches | `/music` | Dev catalog + AudioMix apply (XB-002 masters pending) |
| 13 Photo improvement / Before & after | `/film/enhance` | Local ffmpeg pixel-ops; generative not COMPLETE |
| 14 Studio / Optional advanced controls | `/film/studio` | Shared TimelineContract + Guided Variants panel |
| 15 Finish / Download & private sharing | `/share` | READY QC download (HTTP Range) + metadata ZIP + checklist .txt + stale-final warn + Ceremony Pack + readiness + duration→pack auto-upgrade (>10 min / >20 min) |
| 16–19 Guest flows | `/guest`… | Hash redeem + contribute |
| 20 Owner mobile / Workspace home | `/m` | Implemented |
| 00 Empty / failure / permission states | `/states` | Implemented |

## Production path (2026-10-11)

Restored into monorepo as `apps/creator` (`@memorialvideo/creator`). Visual AppShell preserved; persistence is **local file** when writable, optional **Vercel KV** when env is present, otherwise honest **503 `persistence_unavailable`** (XB-012) — never invent DB secrets.

See `docs/production/` and store `internal/creator-prompt34-progress.md`.

## Blocked / not production-complete

| Item | Reason |
| --- | --- |
| Deploy / Connect Git / memorialvideo-app | XB-011 — other workers / Glenn |
| Live Stripe Memorial Pack | XB-005 secrets; fake fulfill is local-only |
| Supabase TUS / Docker RLS | XB-012 |
| Licensed music masters | XB-002 (synthetic `development_only` catalog active) |
| Native locale review | XB-004 |
| Voice recreation | XB-009 — blocked; do not implement |
| Generative Finish / people intel production | Legal / not COMPLETE |

## Privacy notes

- Fixture images only under `public/fixtures/`.
- No plaintext secrets. No logging of emails, tokens, captions, or names.
- Share and contributor tokens stored as hashes only.
