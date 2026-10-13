# MemorialVideo.app — Full-Stack Implementation Masterplan v1.0

**Status:** Implementation specification  
**Date:** 13 October 2026  
**Repository:** `C:\dev\memorialvideo`  
**Application reference:** https://memorialvideo-app.vercel.app/  
**Audience:** Founder, engineering and Cursor coding agents  
**Objective:** Convert the existing largely UI/mock-data application into a secure, reliable, commercially operational memorial-film creation platform without discarding its visual identity.

> **Baseline integrity:** This document is a target specification, not a verified audit of the repository. Cursor must inspect the actual codebase, reconcile existing packages and providers, and record which capabilities are working, partial, mocked, missing or blocked before modifying them.

---

## 1. Product vision and success criteria

MemorialVideo allows anyone to create a beautiful memorial film with minimal effort. Customers purchase a memorial pack, create a private memorial workspace, upload photos, videos and personal music, invite family members to contribute, automatically generate a film, refine the result, then securely download or stream it.

**Product promise:** *A beautiful tribute, made together, without needing video-editing skills.*

### 1.1 Product principles

1. **Emotionally appropriate:** calm, respectful and supportive interface; no aggressive upselling during creation.
2. **Automatic first, editable always:** deliver a complete film before asking users to understand a timeline.
3. **Trust and privacy by default:** private content, explicit sharing, secure contributions and no unapproved training on private media.
4. **Preserve memories:** keep originals; all enhancement must be non-destructive, especially for faces and personal identity.
5. **One source of film truth:** Story Director, editor, preview, render and audio share one versioned timeline contract.
6. **Consistent 9.5+ design ambition:** preserve the premium existing interface while improving usability, responsiveness and accessibility.
7. **Global-ready:** retain the eight-language setup already planned; localize user-facing strings and transactional messaging.
8. **Real functionality:** no fake saved states, fake upload completion, fake payments, fake progress bars or mock-generated downloads in production.

### 1.2 North-star end-to-end journey

1. Customer discovers the product and selects a memorial pack.
2. Secure checkout creates/associates the purchase entitlement.
3. Customer creates a memorial workspace with basic biographical information.
4. Customer uploads photos, videos, personal songs and optionally voiceovers.
5. Customer shares a private contribution link with friends and family.
6. Contributions arrive in a review queue and can be approved/rejected.
7. Customer selects a film style and generates an automatic first cut.
8. Customer plays the actual film preview, modifies chapters, texts, visuals or music, and saves changes.
9. A render job produces a real, playable MP4 using the stored project timeline.
10. Customer downloads or shares the film through permission-controlled links.

### 1.3 Paid-beta exit criteria

- New user can complete the full journey without developer intervention.
- A project remains intact across sessions, devices and refreshes.
- At least one realistic fixture containing **30 photos, 5 videos and 2 user-uploaded songs** produces an edited, paid-entitled, downloadable full-HD MP4.
- Contribution links work for invited contributors without a mandatory account, within defined limits.
- Failed uploads and renders recover predictably; users see accurate job states.
- Preview and final render honor the same scene order, trims, captions, transitions, track levels and fades.
- Unauthorized users cannot enumerate or access memorial assets or projects.
- Payment webhooks, entitlements, refunds and duplicate event delivery are handled correctly.
- The product is usable on current desktop/mobile browser targets and in all released languages.

---

## 2. Scope and release strategy

| Tier | Capabilities | Gate |
|---|---|---|
| **P0 — Paid beta** | Auth, workspace, project persistence, pack purchase, media uploads, private family contributions, basic Memory Library, film styles, automatic first cut, personal music and audio controls, easy scene refinement, Remotion + FFmpeg render, private streaming/download, support/privacy/analytics | End-to-end revenue-capable journey |
| **P1 — Post-beta quality** | Advanced Memory Intelligence, restoration and quality assessment, manual chapter controls, timeline patches/undo, sophisticated audio mixing, transcription/voiceover, version history, enhanced sharing | Quality and differentiation |
| **P2 — Expansion** | Selective AI cinematic post-production, advanced multicam-like tools, richer team review, full professional white-label, enterprise administration, extensive 4K options | Commercial scale after stability |

**No feature is complete because a button works visually.** Functional completion requires persistence, permissions, failure behavior, real output and automated verification.

---

## 3. Existing system: audit before implementation

Cursor must inventory:

- pnpm monorepo workspaces and package boundaries (`apps/web`, `apps/video`, shared contracts/domain/i18n, as applicable).
- Next.js routes, server actions, API routes, auth/session handlers and middleware.
- Supabase/PostgreSQL schemas, migration history, storage policies and RLS.
- Existing Remotion compositions, rendering entrypoints, player implementation and local golden-render assets.
- Cinema Player, Story Builder, timeline contract, Director/Arrange, Memory Library and audio editor.
- Real versus mock providers, fixtures, placeholders, demo flags and hard-coded project/user IDs.
- Observability, error reporting, notification, localization and billing integrations.
- Vercel runtime limitations, queue/worker setup and whether the existing deployment can run background jobs.
- Existing planning pack, feature ledger and prior work: preserve IDs and decisions rather than replacing them.

### 3.1 Classification rubric

| State | Meaning | Proof required |
|---|---|---|
| WORKING | Actual end-to-end flow with persistence and permissions | Reproducible test/recording/log and code reference |
| PARTIAL | Genuine components exist but complete journey fails | Known gaps and repro |
| MOCKED | Fake fixtures / artificial success | Exact fixture/provider entrypoint |
| MISSING | No useful implementation | Requirement and owner |
| BLOCKED | Requires external credential, licensing or policy decision | External action, fallback and unblock owner |

Create/update `docs/implementation/functional-audit.md`, `implementation-ledger.md`, `architecture-decisions.md`, `production-readiness.md` and a dependency-ordered execution board. Include severity, dependency, test, evidence and exact repository paths for each work item.

---

## 4. Proposed architecture (reconcile, do not blindly replace)

```text
Next.js Web App / PWA
  ├─ Auth, account, checkout, dashboard, creation wizard
  ├─ Memory Library, contribution inbox, Story Builder, film editor
  └─ Remotion Player / Cinema Player (deterministic project preview)
          │ secure server API / jobs
          ▼
Application Domain (typed contracts + server-side authorization)
  ├─ PostgreSQL + row-level security
  ├─ Private object storage + signed uploads/downloads
  ├─ Stripe checkout / webhook / entitlement ledger
  ├─ AI provider adapters (transcription, analysis, story and enhancement)
  ├─ Notifications / analytics / audit events
  └─ Durable queue and background workers
          │
          ▼
TimelineContract v1 (versioned film and audio truth)
  ├─ Story Director returns validated timeline patches
  ├─ Editor returns validated, undoable timeline patches
  ├─ Player previews exactly the saved timeline
  └─ Render workers consume immutable timeline snapshots
          │
          ▼
Remotion + FFmpeg → quality checks → private MP4 + poster + metadata
```

### 4.1 Recommended choices

- **Application:** retain existing Next.js + TypeScript/pnpm architecture.
- **Database/auth:** retain or adopt EU-region Supabase project, PostgreSQL, Auth, RLS and private buckets; confirm existing setup first.
- **Payment:** Stripe Checkout + verified webhooks + server-side entitlement ledger.
- **Video composition:** **Remotion** is the timeline/render authority; **FFmpeg** handles probing, transcoding, thumbnails, audio preparation and packaging as appropriate.
- **Long jobs:** durable queue plus dedicated workers; evaluate Remotion Lambda versus container workers based on real benchmarks, media locality, operational complexity and pricing. **Do not render synchronously in a Vercel HTTP request.**
- **AI:** provider-agnostic adapters for analysis, transcription, layout and optional enhancement. No required vendor lock-in; do not assert a provider is already implemented.
- **Observability:** structured event logs, error reporting, trace/job IDs, metrics, dashboard and alerts.
- **Localization:** preserve 8-language infrastructure; exact locales must be verified in repository.

### 4.2 Architecture invariants

- Public clients never possess service-role or payment secret keys.
- Every read/write on a project has a server-side authorization decision.
- Uploaded originals are immutable; derivatives have provenance and versioning.
- All storage links are private, expiring and scoped by permissions.
- Every render references an immutable project/timeline snapshot and input asset versions.
- Every asynchronous job has idempotency, retry strategy and terminal failure handling.
- A failed AI call never destroys the editable project.
- AI output is structured, schema-validated and previewable before acceptance.
- Payment state and entitlement enforcement reside on the server.

---

## 5. Domain and data model

Use UUIDs, UTC timestamps, created/updated metadata, ownership references and explicit status enums. Adapt field names to existing schemas and create additive migrations where possible.

### 5.1 Proposed principal entities

| Entity | Core fields / relations | Purpose |
|---|---|---|
| `profiles` | user_id, locale, display_name, preferences | Account preferences |
| `organizations` | id, name, kind, branding | Optional professional tenant |
| `organization_memberships` | organization_id, user_id, role | Professional authorization |
| `memorials` | id, owner_id, subject_name, bio, dates, locale, privacy, status | Private project root |
| `memorial_memberships` | memorial_id, user_id, role | Owner/editor/viewer access |
| `contribution_links` | memorial_id, token_hash, expires_at, max_uses, revoked_at, permissions | Restricted guest upload |
| `contributions` | memorial_id, link_id, sender_alias, message, status, submitted_at | Moderation queue |
| `media_assets` | memorial_id, uploader_id, type, mime, original_key, bytes, checksum, metadata, status | Original media |
| `media_derivatives` | asset_id, kind, object_key, parameters, provenance, quality | Thumbnail/transcode/enhancement |
| `people` | memorial_id, display_name, relationship, review_state | Optional identity metadata |
| `memory_items` | memorial_id, asset_ids, caption, date_range, date_confidence, tags, review_state | Curated memories |
| `story_versions` | memorial_id, version, source_revision, generated_at, approval | Story output history |
| `timeline_versions` | memorial_id, version, schema_version, json, checksum, created_by | Editable film truth |
| `timeline_patches` | timeline_version_id, op, payload, undo_payload, actor | Auditable edit history |
| `film_styles` | id, locale, version, presets, preview_assets, published | Approved templates |
| `audio_tracks` | timeline_id, asset_id, type, timing, gain, fades, ducking_rules | Music/video/voiceover |
| `processing_jobs` | id, kind, entity_id, status, progress, attempt, error, idempotency_key | Durable job control |
| `render_jobs` | memorial_id, snapshot_id, preset, status, progress, output_id, error | Render lifecycle |
| `render_outputs` | render_id, object_key, poster_key, checksum, duration, codec, size | Verified deliverables |
| `products` / `prices` | stripe IDs, plan config, limits, currency | Commercial catalogue |
| `orders` / `entitlements` | user_id, memorial_id, stripe ref, status, limits | Paid access |
| `webhook_events` | provider, event_id, processed_at, outcome | Idempotent payment events |
| `share_links` | memorial_id, output_id, token_hash, privacy, expires_at, revoked_at | Private viewing |
| `notifications` | user_id, event, channel, status | Operational communications |
| `audit_events` | actor, object, action, timestamp, request_id | Accountability |

### 5.2 Roles and authorization

- **Owner:** billing, sharing, project deletion, collaborators, media and exports.
- **Editor:** permitted media/story/timeline changes, not owner billing or deletion unless explicitly delegated.
- **Viewer:** private playback subject to entitlement and share policy.
- **Contributor:** token-scoped upload only; no list/read of unrelated assets or project data.
- **Professional administrator:** access only to explicit tenant projects and assigned teams.

Enforce ownership or membership on server mutations and row-level policies. Audit guest token access, avoid tokens in logs, hash stored invitation secrets, rate limit uploads, and allow owner revocation.

### 5.3 Lifecycle state machines

```text
Media: pending_upload → uploading → uploaded → scanning → processing → ready
                                              ↘ failed / quarantined / deleted
Contribution: submitted → pending_review → approved | rejected | withdrawn
Story: empty → collecting → ready_to_generate → generating → draft → approved
Render: queued → preparing → rendering → packaging → verifying → completed
                      ↘ retrying / failed / cancelled
Payment: created → pending → paid → refunded/partially_refunded | failed
```

Provide explicit transitions, cancellation rules and recovery paths; never infer a paid state from a frontend redirect alone.

---

## 6. Video timeline contract and rendering fidelity

### 6.1 Versioned contract (illustrative, not a drop-in schema)

```ts
type TimelineContract = {
  schemaVersion: 1;
  memorialId: string;
  revision: number;
  fps: 30;
  canvas: { width: number; height: number; aspectRatio: '16:9' | '9:16' };
  styleId: string;
  chapters: Array<{ id: string; title?: string; sceneIds: string[] }>;
  scenes: Array<{
    id: string;
    type: 'photo' | 'video' | 'title' | 'montage' | 'closing';
    assetId?: string;
    startFrame: number;
    durationFrames: number;
    mediaInFrames?: number;
    crop?: { x: number; y: number; scale: number };
    title?: string;
    motionPreset?: string;
    transition?: { type: string; durationFrames: number };
  }>;
  audio: Array<{
    id: string;
    assetId: string;
    kind: 'music' | 'voiceover' | 'source';
    startFrame: number;
    durationFrames: number;
    sourceOffsetFrames: number;
    gain: number;
    fadeInFrames: number;
    fadeOutFrames: number;
    muted: boolean;
  }>;
};
```

Implementation details should be refined into shared Zod/TypeScript schemas. Add scene IDs, asset provenance, font/theme references, version migrations, transition overlap semantics and precise audio sample handling. Restrict operations to validated patch commands such as `insertScene`, `moveScene`, `trimScene`, `replaceAsset`, `setCrop`, `setText`, `addTrack`, `trimTrack`, `setGain`, `setFade`, `setChapter`, `applyStyle` and `undo`.

### 6.2 Director authority

The Story Director generates or suggests timeline patches only. It must not directly overwrite a published render or corrupt a user's manual arrangement. Store drafts, detect revision conflicts and offer explicit regenerate-chapter versus regenerate-entire-film controls.

### 6.3 Preview parity

- The browser player and server renderer use the same shared composition and timeline input.
- Proxy previews and original media resolve from consistent asset IDs; project timings never depend on temporary signed URLs.
- Time measured in frames/samples; clear rounding and clipping rules.
- Crossfades, gain envelopes and video audio rules are unit tested.
- Use golden render comparisons and audio duration/peak/loudness assertions where appropriate.

---

## 7. Functional modules and acceptance criteria

### M01 — Account and workspace

**Build:** signup/sign-in, password/reset or approved providers, session renewal, dashboard, memorial creation/edit/archive/delete, member roles, preferences, localization and complete loading/errors.

**Accept:** A new user can create a memorial, sign out, sign back in and see all real persisted details; another user is denied access.

### M02 — Media Library and upload ingestion

**Build:** upload UI and backend for JPG/PNG/WebP/HEIC (where supported), MP4/MOV and MP3/WAV/M4A; resumable large files or recovery; signed upload URLs; checksum/deduplication; upload progress; file size/type constraints; malware/suspicious-file checks; EXIF orientation; FFprobe; thumbnails; previews; non-destructive originals; retry/delete; media organization.

**Accept:** A realistic 30-photo/5-video/2-song fixture uploads, processes and remains available after reload, without exposing private storage objects.

### M03 — Family contribution flow

**Build:** generate/share/copy invitation link, expiration/revocation, guest landing, guest upload, optional caption/name, consent/privacy text, moderation queue, accept/reject, secure asset promotion to the Library, notifications and abuse prevention.

**Accept:** A fresh browser without a signed-in account uploads through a valid invitation and cannot access any other memorial asset. Revoked/expired links stop working.

### M04 — Memory Intelligence

**Build:** metadata extraction, OCR where useful, transcription with user review, time inference with confidence, duplicate scoring, quality warnings, optional scene grouping and suggested ordering. Store provenance and allow users to correct suggestions.

**Accept:** Incorrect inferences are never silently asserted as biographical truth; user edits survive regeneration.

### M05 — Story Builder / automatic film

**Build:** guided film creation, missing-input validation, film duration/style selection, deterministic layout heuristics plus optional AI story decisions, chapters, opening/closing scenes, title cards, motion, transitions, story revision, regenerate-section and fallback when AI is unavailable.

**Accept:** The fixture generates a complete previewable first cut with actual assets, usable timeline, sensible pacing and no empty/invalid scenes.

### M06 — Music and audio studio (P0)

**Build:** uploads, built-in *licensed* catalogue architecture, song search/previews, multi-track placement, chapter-specific music, move/trim, fades and crossfades, independent music/source/voiceover gains, mute/solo, basic audio ducking, waveform and full preview sync. Normalize safe loudness and prevent clipping during final render.

**Rights UX:** Users can add meaningful personal songs but must confirm they have relevant rights/permissions. A customer upload does not automatically provide MemorialVideo with distribution rights for public streams. Licensed catalogue rights must explicitly cover jurisdictions, synchronization, download and applicable sharing.

**Accept:** Two personal songs can be placed in different film sections, edited and mixed with spoken video; rendered output matches timing, gain and fades in preview.

### M07 — Film editor / Cinema Player

**Build:** chapter panel, reorder, trim, replace visual, photo crop, titles, style adjustments, transitions, automatic saves, undo/redo, version checkpoints, responsive editor, keyboard and accessible controls, full-screen Cinema Player and export preview.

**UX rule:** Prioritize accessible “simple edit” controls; hide precision tracks behind progressive disclosure so users are not forced into complex editing.

**Accept:** Edits survive refresh, can be undone, and appear correctly in a newly rendered MP4.

### M08 — Rendering and post-processing

**Build:** job submission, queue, immutable snapshots, worker controls, Remotion composition, FFmpeg preprocess/package, 1080p H.264 MP4, optional 4K gated by plan, poster, muxed audio, reliable percentage/phase updates, cancellation, retries, failure summaries, quality probes, secure object storage and signed downloads.

**Accept:** Rendering a long realistic video does not require a persistent open browser and does not time out due to serverless request limits. A completed output passes automated duration/codec/audio checks.

### M09 — Billing and entitlements

**Build:** product/price data, Stripe checkout and customer portal as relevant, secure order initiation, webhooks, idempotency, purchases by memorial/user, plan limits, entitled render/export, successful payment return flow, failed payments, refunds, invoice/receipt linking and admin reconciliation.

**Accept:** Duplicate webhooks do not create duplicate entitlements; client cannot bypass payment to render or download paid output.

### M10 — Private sharing and streaming

**Build:** private screening room, signed streams, sharing permissions, invite links, expiration/revocation, password optionality, safe playback metadata, downloadable MP4, export history, clear privacy settings and owner controls.

**Accept:** Revoked access fails; unauthorized direct object URLs cannot persist indefinitely; streaming works on representative desktop and mobile clients.

### M11 — Professional / white-label (post-beta or separately gated)

**Build:** professional organizations, delegated users, multi-project view, client invitations, branded outputs and screening rooms, custom domain/brand architecture, access policies, professional billing and role audit trails.

**Accept:** Tenant isolation tests pass; no professional can see another organization's projects.

### M12 — Internationalization, support and operations

**Build:** complete localization of UI/transactional flows, date/currency formats, support paths, report-problem, transactional emails, accessibility, analytics with privacy boundaries, telemetry, monitoring, abuse controls, data retention/deletion and disaster recovery.

**Accept:** Each launch language completes creation/checkout/export without untranslated critical strings; operational failures have alerting and a support runbook.

---

## 8. User journeys, UX and UI quality bar

### 8.1 Family customer

**Landing → Pack → Checkout → Memorial workspace → Gather media → Invite family → Choose style → Generate → Preview → Adjust → Render → Download/share.**

For every state include: first-time empty state, partially complete state, pending upload/processing, completion, recoverable failure and meaningful next action. Autosave must clearly indicate saving/saved/error states. Never make irreversible or costly actions ambiguous.

### 8.2 Contributor

**Open link → Understand whom the memories are for → Add files and optional story → Confirm privacy → Upload → Receive confirmation.** No mandatory registration; avoid exposing owner email, billing or existing private memories.

### 8.3 Professional

**Organization → Create client memorial → Invite contributors → Review/edit → Client approve → Render → Deliver** with brand and permission boundaries.

### 8.4 UX guardrails

- Preserve existing premium typography, film imagery, cream/dark visual language and cinematic player principles if present.
- Do not redesign the app globally or introduce unrelated component libraries.
- Respect grief context: calm confirmation language, easy undo, no alarming errors, no manipulative scarcity.
- One primary CTA per stage; concise explanation and progress; advanced edit features optional.
- High-quality keyboard focus, labels, contrast, reduced-motion behavior, screen-reader announcements and touch targets.
- Responsive mobile support, including upload and review, while complex precision editing may use an explicitly designed mobile subset.

---

## 9. Security, privacy, legal and trust requirements

- Access control and RLS for every private memorial/asset relation.
- Signed, scoped, short-lived object URLs; private-by-default buckets.
- Validate MIME from content, not only extension; reject unsupported/corrupt media; constrain decompression, frame counts and upload abuse.
- Secure webhook signatures, server-side payment entitlements and event deduplication.
- Encrypted transport, restricted secrets, least-privilege credentials and an explicit rotation strategy.
- Guest invites use strong random secrets; store hashes, expiry, revocation and rate limits.
- Data subject rights flow, deletion with downstream object cleanup, retention rules and a backup/restore plan.
- GDPR and relevant jurisdictional requirements assessed; deceased-person privacy, surviving contributors' information and minor images require particular care. Confirm legal obligations with appropriate counsel.
- No biometric/face identification or AI training on personal material without an explicitly approved legal/privacy basis and suitable consent design.
- Music ownership/licensing disclaimers are not substitutes for actual rights; document catalogue license scope and public/private sharing constraints.
- AI output must not fabricate sensitive details about the memorial subject, and destructive image manipulation must not be default behavior.

---

## 10. Reliability, telemetry and operating model

### 10.1 Events and metrics

Track privacy-safe events such as `checkout_started`, `payment_confirmed`, `memorial_created`, `invite_created`, `upload_started`, `upload_completed`, `contribution_approved`, `story_generated`, `timeline_saved`, `render_queued`, `render_completed`, `render_failed`, `download_completed`.

Measure: first-film completion rate, time to first preview, time to render, job failure/retry rate, video length vs render cost, upload failure rate, contributor participation and payment-to-export conversion. Do not log private memories, transcription text, invite tokens or user-uploaded song filenames unnecessarily.

### 10.2 Failure and retry policy

- Jobs persist across browser refresh and deploys.
- Retried jobs are idempotent; immutable outputs use unique versioned paths.
- Poison jobs enter an inspectable failed state / dead-letter queue.
- Partial derivatives can be safely cleaned up.
- User receives actionable error states, without leaked technical details.
- Alert on render failure spikes, stuck queue, storage pressure, payment-webhook errors, broken signed links and high cost per film.

### 10.3 Cost controls

Set configurable media limits, project quotas, render concurrency, duration caps, per-project processing budgets, per-tenant rate limits, and 4K/AI enhancement entitlements. Record the estimated and actual rendering cost per completed film, including storage, egress and provider usage.

---

## 11. Testing and quality gates

| Layer | Required tests |
|---|---|
| Domain/contracts | Schema validation, state transitions, timeline patches, permissions and entitlement rules |
| Storage/upload | MIME enforcement, corrupted media, multipart/resume, signed access, duplicate requests |
| Collaboration | Valid/invalid/expired/revoked guest tokens, scope isolation, moderation |
| Director | Empty/minimum/large albums, no songs, long songs, conflicting dates, fixed/manual edits |
| Audio | Frame/sample offsets, trims, fades, ducking, peak/loudness, no clipping, playback parity |
| Rendering | Golden 1080p fixtures, codec/metadata, frame boundaries, missing media, timeout/retry, job cancellation |
| Billing | Verified webhook, duplicate/out-of-order events, refund, entitlement and export gating |
| Security | Cross-user project access, IDOR, RLS, storage paths, injection, oversized uploads |
| UX | Full creation on desktop/mobile, keyboard navigation, loading/error/empty states, localization |
| Operations | Alert rules, queue recovery, backup restoration, deleted content purge, cost ceilings |

**Quality target:** no known P0 blocker, no exposed private media, no silent data loss, no broken customer paid journey, green required CI, documented runbooks and a real final export verification.

---

## 12. Implementation roadmap: dependency-ordered vertical slices

Each slice must produce a verifiable user outcome, not just infrastructure.

| Slice | Build and validate | Prerequisites | Definition of done |
|---|---|---|---|
| 00 | Code audit, working/mocked matrix, migration/rollout plan | Repository | Evidence-backed backlog |
| 01 | Sign-in → create project → refresh → reload project | Auth/DB | Persistence + access tests |
| 02 | Upload photo/video/song → process → Library | Storage/workers | Files usable in project |
| 03 | Guest invite → submit → owner approve | Slice 02 | Secure cross-browser journey |
| 04 | Create 1 real simple Remotion film from persisted assets | Timeline/Remotion | Actual playable MP4 |
| 05 | Choose style → auto-generate first draft → preview | Slice 04 | Film from real user data |
| 06 | Add two songs → trim/fade/mix → preview/render | Slice 05 | Audio parity tests |
| 07 | Reorder/trim/title edit → autosave → render again | Slice 05 | Persisted editable film |
| 08 | Stripe paid pack → entitlement → export | Slices 04–07 | Paid end-to-end journey |
| 09 | Private streaming/share → revoke access | Render/storage | Secure screening |
| 10 | Advanced AI analysis, restoration and chapter regeneration | Stable core | Safe, reviewed enrichment |
| 11 | Professional workspaces and white-label | Stable core/roles | Tenant isolation |
| 12 | Global QA, resilience, monitoring and launch hardening | All P0 | Release gate green |

### 12.1 First milestone (non-negotiable)

**One end-to-end functional memorial:** New account → project → 30 photos / 5 videos / 2 songs → automatic draft → edit → payment entitlement → background 1080p render → accessible MP4. Keep this scenario as a permanent CI/manual launch fixture.

### 12.2 Work-ticket template

```md
## MV-XXX — Short outcome
- Priority: P0/P1/P2
- Status: TODO/IN_PROGRESS/BLOCKED/VERIFIED
- Dependencies:
- Existing implementation evidence:
- Missing behavior:
- Files/components:
- DB migration / RLS impact:
- Security and privacy implications:
- UI states:
- Test cases:
- Acceptance evidence:
- Rollback notes:
```

---

## 13. Cursor operating instructions — paste as initial goal

> **Important:** Cursor can keep taking successive tasks within an active coding session, but it cannot bypass credentials, human approvals, licensing, external service configuration or tooling limits. Every claim must be backed by actual run output and code evidence.

```text
GOAL: Complete MemorialVideo's existing application, not a replacement application.

Repo: C:\dev\memorialvideo
App reference: https://memorialvideo-app.vercel.app/
Master specification: MemorialVideo-Full-Stack-Implementation-Masterplan-v1.0.md

FIRST:
1. Read the complete master specification and repository governance/ledger.
2. Inspect all real app routes, services, contracts, migrations and Remotion compositions.
3. Create an evidence-backed WORKING/PARTIAL/MOCKED/MISSING/BLOCKED audit.
4. Reconcile this masterplan with existing architecture and preserve sound code.
5. Produce a dependency-ordered implementation ledger using existing ticket IDs where available.

THEN IMPLEMENT:
- Execute the first unblocked P0 vertical slice.
- Make the existing UI genuinely functional with real data, persistence and permissions.
- Implement migrations, APIs, states, tests and verified end-to-end behavior together.
- Do not use mock success or simulated download/payment/render completion in production.
- Use one shared versioned TimelineContract for Director, editor, player and Remotion rendering.
- Support personal song uploads, multiple audio tracks, trimming, fades and final-audio parity.
- Use durable asynchronous render jobs and private output storage.
- Preserve the existing design system, cinematic player and localization architecture.

AFTER EACH SLICE:
1. Run lint, typecheck, targeted tests, production build and relevant E2E tests.
2. Verify behavior against actual data and capture reproducible evidence.
3. Update the ledger, risk list, decision log and next unblocked task.
4. Continue within the active session without repeatedly asking for instruction.

IF BLOCKED:
- State the exact missing credential/service/license/decision.
- Do not fake implementation success.
- Complete other independently testable work.
- Leave concise, actionable integration steps for the founder.

Do not claim completion until a new customer can pay, upload media and songs,
collect family memories, generate/edit a film, render a genuine MP4 and download/share it securely.

Start with Phase 0 audit and immediately proceed to the first verified vertical slice.
```

---

## 14. Follow-up Cursor prompts by functional group

Use only after Cursor has reconciled the codebase; do not run conflicting concurrent migrations.

### Prompt A — Auth and persistence

```text
Implement the first real production slice: account authentication, memorial CRUD,
project persistence, authorization and RLS in the existing UI.
Inspect existing code and migrations first. Provide secure DB changes, server validation,
loading/error states, integration tests and evidence that users cannot access other projects.
Keep mock fallback isolated to demo mode only. Update the ledger when verified.
```

### Prompt B — Real upload pipeline

```text
Implement real private photo, video and personal music upload end to end.
Use secure storage, limits, metadata processing, thumbnails/proxies, job recovery,
progress/error states and Memory Library persistence. Verify JPG/PNG/MOV/MP4/MP3/WAV/M4A
as supported by actual ingestion tests. Never expose public original asset URLs.
```

### Prompt C — Family contributions

```text
Build secure token-scoped guest contribution links and owner moderation.
Guest submission must not require an account or grant read access to unrelated assets.
Implement revocation/expiration/rate limits and verify a real cross-browser upload and approval.
```

### Prompt D — Automatic first film

```text
Connect the existing Story Builder and film styles to real stored memories.
Generate a valid, persisted TimelineContract, render its preview in the Cinema Player,
and produce a real Remotion MP4 via the existing or selected background-render backend.
Preserve all manual edits and keep the director output schema-validated.
```

### Prompt E — Personal music + full audio

```text
Implement upload and management of personal music, multiple songs per film,
chapter placement, move/trim, fades, volume, video source audio and voiceover handling.
Use the same authoritative timeline for browser preview and FFmpeg/Remotion export.
Add waveform where practical, prevent clipping and prove preview/render audio parity.
```

### Prompt F — Film editor

```text
Make every existing editor interaction real: select/reorder/replace/trim scenes,
modify titles, crop photos, edit transitions, save, undo/redo and regenerate chapters.
Use validated TimelinePatch operations, revision conflict handling, autosave and tests.
Do not replace the design or create a second timeline model.
```

### Prompt G — Checkout, delivery and hardening

```text
Implement verified Stripe checkout/webhooks, server-side entitlements,
background render tracking, secure downloads/private screening and revocable share links.
Test duplicate payment events, unauthorized downloads, render failures and mobile playback.
Add privacy-safe monitoring, error recovery and release acceptance checks.
```

---

## 15. Human dependencies and launch checklist

The coding agent must explicitly surface, not conceal, any unresolved items:

- Production Supabase region, migrations, credentials and bucket policies.
- Stripe products/prices/webhook secrets, tax/refund and multi-currency arrangements.
- Rendering provider selection and resource budget; deployment credentials and durable queue infrastructure.
- Music licensing for built-in tracks, including territory/synchronization/streaming/download rights.
- Approved privacy policy, terms, data retention and copyright reporting process.
- Email sender/domain, deliverability and support/contact setup.
- Realistic consented media/audio test pack for production validation.
- Domain, monitoring, backup, alerting and incident owner.
- Native-language review of the eight launch locales.

**Production launch must not depend on hidden developer manual steps for each customer film.**

---

## 16. Definition of done: whole platform

The application is complete for the intended paid beta **only when** all of the following are demonstrated with real data:

- [ ] Fresh user creates/signs into an account securely.
- [ ] User purchases the appropriate memorial pack.
- [ ] User creates a persisted private memorial workspace.
- [ ] User uploads and organizes photos and videos.
- [ ] User uploads two personal songs and can position/edit both.
- [ ] An invited guest uploads memories securely without an account.
- [ ] Owner approves guest contributions.
- [ ] Automatic Story Director generates a real first cut.
- [ ] The player shows the actual saved timeline.
- [ ] User modifies scenes and music; changes persist and can be undone.
- [ ] Background workers create a genuine audio-synced full-HD MP4.
- [ ] Export access is enforced server-side by paid entitlement.
- [ ] User downloads and privately shares the film.
- [ ] Revocation and unauthorized access tests pass.
- [ ] Upload, render, payment and email failures recover safely.
- [ ] Core journeys work on desktop/mobile and in all released languages.
- [ ] CI, security, operational monitoring and backup/restore gates pass.
- [ ] Founder can operate the product without engineer-assisted fulfillment.

**Quality ambition:** a genuinely excellent 9.5+/10 experience. This is an evaluation target, not a claim that the score has been independently measured.

---

## 17. Immediate next actions

1. Put this Markdown file in the repository (suggested path `docs/implementation/MemorialVideo-Full-Stack-Implementation-Masterplan-v1.0.md`).
2. Run the **Cursor operating instructions** above.
3. Review Cursor's functional audit and explicitly resolve material mismatches with the existing codebase.
4. Implement and verify Slice 01, then Slice 02 and the first real MP4 pipeline as early as technically possible.
5. Use the paid-beta exit checklist as the single release decision gate.

**Operating rule:** Preserve what is beautiful; make what exists genuinely work; prove the complete film journey before expanding advanced tools.
