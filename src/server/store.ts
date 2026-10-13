import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ASSET_STATUS } from '@memorialvideo/contracts';
import {
  canFulfillLocalFakeCheckout,
  createProjectPublicId,
  hashTimeline,
  isProjectPublicId,
  mapAssetStatusToUi,
  MEMORIAL_PACK_PACKAGE_KEY,
  memorialPackPolicy,
  nextCollectionStatus,
  nextOrderStatus,
  planAutosaveWrite,
  planTimelinePublish,
  shouldRevokeEntitlement,
  type AssetStatus,
  type AssetUiFailureCode,
  type CollectionStatus,
  type CommerceEventType,
  type InviteScope,
  type ShareScope,
} from '@memorialvideo/domain';
import {
  RENDER_JOB_STATUSES,
  ceremonyMusicPlanSchema,
  parseTimelineContract,
  peopleConsentSchema,
  sanitizePersonLabel,
  type AudioMixContract,
  type CeremonyMusicPlan,
  type PeopleConsent,
  type TimelineContract,
} from '@memorialvideo/contracts';
import { peopleProcessingAllowed } from '@memorialvideo/domain';
import { z } from 'zod';
import { creatorEnv } from './env';
import { isHeicFilename, isIngestTerminal, nextIngestStatus } from './ingest';
import {
  PersistenceUnavailableError,
  assertPersistenceWritable,
  readKvStoreDocument,
  resolvePersistence,
  writeKvStoreDocument,
} from './persistence';
import { actorAllowsTribute, currentAccountId } from './actor';
import { applyFilmChoicesToTimeline, buildTimelineFromTribute } from './timeline';
import { lifeSpanLabel as lifeSpanFromLabels } from './tribute-helpers';

const assetStatusSchema = z.enum(ASSET_STATUS);

export const memoryAssetSchema = z.object({
  id: z.string().min(8).max(80),
  title: z.string().trim().min(1).max(160),
  year: z.string().max(16).default(''),
  ingestStatus: assetStatusSchema,
  failureCode: z.enum(['heic', 'rejected', 'failed', 'generic']).nullable().optional(),
  imagePath: z.string().max(240),
  /** SHA-256 of stored original bytes. Absent until a private upload finishes. */
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** Personal song uploads require an explicit rights confirmation. */
  rightsConfirmed: z.boolean().optional(),
  /** Declared upload MIME — used to place short videos as TimelineContract video scenes. */
  contentType: z.string().max(120).optional(),
  /** Probed duration for video/mp4 (ms). Never invents length when absent. */
  durationMs: z.number().int().nonnegative().max(120_000).optional(),
  originalFilenameHint: z.string().max(80).optional(),
  source: z.enum(['owner', 'contributor']).default('owner'),
  /** First name only for owner review UI — never logged. */
  contributorName: z.string().max(40).optional(),
  contributorNote: z.string().max(280).optional(),
  reviewState: z.enum(['pending', 'accepted', 'declined']).default('accepted'),
  inviteId: z.string().max(80).optional(),
  createdAt: z.string().min(10).max(40),
  updatedAt: z.string().min(10).max(40),
});

export type MemoryAsset = z.infer<typeof memoryAssetSchema>;

export const contributorInviteSchema = z.object({
  id: z.string().min(8).max(80),
  /** SHA-256(pepper:token) hex — never store plaintext tokens. */
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.enum(['upload_only', 'upload_and_comment']),
  expiresAt: z.string().min(10).max(40),
  useCount: z.number().int().min(0).default(0),
  maxUses: z.number().int().positive().nullable().default(20),
  revokedAt: z.string().min(10).max(40).nullable().default(null),
  createdAt: z.string().min(10).max(40),
});

export type StoredContributorInvite = z.infer<typeof contributorInviteSchema>;

export const privateShareSchema = z.object({
  id: z.string().min(8).max(80),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.enum(['preview', 'final_view', 'approval']),
  expiresAt: z.string().min(10).max(40),
  revokedAt: z.string().min(10).max(40).nullable().default(null),
  createdAt: z.string().min(10).max(40),
});

export type StoredPrivateShare = z.infer<typeof privateShareSchema>;

/** Local MV-110/119 placement proposal — never mutates timeline until family confirm. */
export const storedPlacementSuggestionSchema = z.object({
  id: z.string().min(8).max(80),
  assetId: z.string().min(8).max(80),
  suggestedChapterId: z.string().max(80).optional(),
  suggestedSortHint: z.number().int().optional(),
  status: z.enum(['proposed', 'confirmed', 'dismissed']),
  familyMustConfirm: z.literal(true).default(true),
  changeTimeline: z.literal(false).default(false),
  provenance: z
    .object({
      provider: z.string().max(80),
      model: z.string().max(80),
      version: z.string().max(40),
    })
    .default({
      provider: 'memorialvideo-collaboration-summary',
      model: 'placement-hint-v1',
      version: 'v1-local',
    }),
  /** Compiled insert_scene patch + snapshots after Preview. */
  filmPatch: z
    .object({
      patch: z.unknown(),
      beforeSnapshot: z.unknown(),
      afterSnapshot: z.unknown(),
      applyStatus: z.enum(['none', 'applied', 'reverted']),
    })
    .nullable()
    .default(null),
  createdAt: z.string().min(10).max(40),
  updatedAt: z.string().min(10).max(40),
});

export type StoredPlacementSuggestion = z.infer<typeof storedPlacementSuggestionSchema>;

export const storedCollaborationDecisionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(8).max(80),
  kind: z.enum(['fact', 'placement', 'approval', 'exclusion', 'comment']),
  outcome: z.enum([
    'approve',
    'request_changes',
    'defer',
    'confirm',
    'dismiss',
    'keep_both',
    'leave_unresolved',
  ]),
  subjectType: z.enum([
    'review_comment',
    'story_conflict',
    'duplicate_pair',
    'placement_suggestion',
    'final_film',
    'review_task',
  ]),
  subjectId: z.string().min(1).max(120),
  status: z.enum(['active', 'superseded']).default('active'),
  decidedByFamily: z.literal(true),
  summary: z.string().max(400),
  summaryKey: z.string().max(120).optional(),
  relatedCommentId: z.string().max(80).optional(),
  relatedConflictId: z.string().max(80).optional(),
  relatedTaskId: z.string().max(80).optional(),
  version: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(10).max(40),
});

export type StoredCollaborationDecision = z.infer<typeof storedCollaborationDecisionSchema>;

export const storedCollaborationTaskSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(8).max(80),
  kind: z.enum([
    'resolve_comment',
    'review_conflict',
    'review_duplicate',
    'confirm_placement',
    'final_approval',
  ]),
  status: z.enum(['open', 'done', 'cancelled']),
  subjectType: z.enum([
    'review_comment',
    'story_conflict',
    'duplicate_pair',
    'placement_suggestion',
    'final_film',
    'review_task',
  ]),
  subjectId: z.string().min(1).max(120),
  labelKey: z.string().max(120),
  version: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(10).max(40),
  completedAt: z.string().min(10).max(40).nullable().default(null),
});

export type StoredCollaborationTask = z.infer<typeof storedCollaborationTaskSchema>;

export const guestSessionSchema = z.object({
  sessionId: z.string().min(16).max(80),
  inviteId: z.string().min(8).max(80),
  tributePublicId: z.string().regex(/^mv_[a-f0-9]{16}$/i),
  expiresAt: z.string().min(10).max(40),
  createdAt: z.string().min(10).max(40),
});

export type GuestSession = z.infer<typeof guestSessionSchema>;

export const renderJobSchema = z.object({
  id: z.string().min(8).max(80),
  kind: z.enum(['preview', 'final']),
  status: z.enum(RENDER_JOB_STATUSES),
  snapshotHash: z.string().min(16).max(80),
  timelineVersion: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative().default(0),
  queuedAt: z.string().min(10).max(40),
  updatedAt: z.string().min(10).max(40),
  lastHeartbeatAt: z.string().min(10).max(40).nullable().default(null),
  qcFailures: z.array(z.string()).default([]),
  /** Relative opaque path under .data — never a public URL. */
  outputPath: z.string().max(240).nullable().default(null),
  /** JPEG still beside READY MP4 (`ffmpeg -ss … -frames:v 1`). Failure never blocks READY. */
  posterPath: z.string().max(240).nullable().default(null),
  outputVerified: z.boolean().default(false),
  failureReason: z.string().max(80).nullable().default(null),
});

export type StoredRenderJob = z.infer<typeof renderJobSchema>;

export const memberSchema = z.object({
  id: z.string().min(8).max(80),
  /** Display label only — never an email in logs. */
  label: z.string().trim().min(1).max(80),
  role: z.enum(['owner', 'editor', 'viewer']),
  status: z.enum(['active', 'invited', 'revoked']),
  createdAt: z.string().min(10).max(40),
  updatedAt: z.string().min(10).max(40),
});

export type StoredMember = z.infer<typeof memberSchema>;

export const activityEventSchema = z.object({
  id: z.string().min(8).max(80),
  code: z.enum([
    'tribute_created',
    'memory_added',
    'invite_created',
    'invite_revoked',
    'collection_locked',
    'collection_opened',
    'timeline_edited',
    'render_enqueued',
    'render_failed',
    'render_ready',
    'share_created',
    'member_added',
    'checklist_updated',
    'pack_fulfilled',
    'ceremony_music_applied',
    'guided_audio_applied',
    'people_consent_updated',
    'placement_proposed',
    'placement_confirmed',
    'collaboration_decision',
    'enhancement_film_bound',
  ]),
  /** Opaque correlation — no emails, tokens, filenames, captions. */
  correlationId: z.string().max(40).optional(),
  createdAt: z.string().min(10).max(40),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const ceremonyChecklistSchema = z.object({
  downloadDevice: z.boolean().default(false),
  testVenue: z.boolean().default(false),
  soundtrackCleared: z.boolean().default(false),
  updatedAt: z.string().min(10).max(40).nullable().default(null),
});

export type CeremonyChecklist = z.infer<typeof ceremonyChecklistSchema>;

export const tributeSchema = z.object({
  publicId: z.string().regex(/^mv_[a-f0-9]{16}$/i),
  displayName: z.string().trim().min(1).max(160),
  bornLabel: z.string().max(80).default(''),
  rememberedLabel: z.string().max(80).default(''),
  about: z.string().max(500).default(''),
  ownerInitial: z.string().max(2).default('Y'),
  themeKey: z.enum(['timeless', 'joyful', 'peaceful']).default('timeless'),
  locale: z.enum(['en', 'nl', 'de', 'fr', 'es', 'pt', 'it', 'pl']).default('en'),
  firstFilmStage: z
    .enum(['idle', 'preparing_memories', 'building_story', 'arranging_film', 'finishing', 'ready_to_review', 'blocked'])
    .default('idle'),
  collectionStatus: z.enum(['NOT_STARTED', 'OPEN', 'LOCKED']).default('NOT_STARTED'),
  memories: z.array(memoryAssetSchema).max(200).default([]),
  invites: z.array(contributorInviteSchema).max(50).default([]),
  shares: z.array(privateShareSchema).max(50).default([]),
  renderJobs: z.array(renderJobSchema).max(40).default([]),
  members: z.array(memberSchema).max(40).default([]),
  activity: z.array(activityEventSchema).max(200).default([]),
  /** MV-110/119 local collab inbox — placement proposals + family decisions. */
  placementSuggestions: z.array(storedPlacementSuggestionSchema).max(100).default([]),
  collaborationDecisions: z.array(storedCollaborationDecisionSchema).max(200).default([]),
  collaborationTasks: z.array(storedCollaborationTaskSchema).max(100).default([]),
  ceremonyChecklist: ceremonyChecklistSchema.default({
    downloadDevice: false,
    testVenue: false,
    soundtrackCleared: false,
    updatedAt: null,
  }),
  /** Synthetic catalog track id only — user commercial uploads stay off. */
  soundtrackTrackId: z.string().max(80).nullable().default(null),
  musicRightsConfirmed: z.boolean().default(false),
  /** Ceremony music plan (single or 4-moment). Null until applied/saved. */
  ceremonyMusicPlan: ceremonyMusicPlanSchema.nullable().default(null),
  /** Pending Guided Audio mix (propose → preview → apply). */
  guidedAudioPending: z.unknown().nullable().default(null),
  /** People Intelligence consent — disabled by default; face detection not COMPLETE here. */
  peopleConsent: peopleConsentSchema.nullable().default(null),
  /** Family-labeled person profiles (manual). No biometric embeddings in creator local store. */
  peopleProfiles: z
    .array(
      z.object({
        id: z.string().min(8).max(80),
        displayLabel: z.string().trim().min(1).max(80),
        approvedForStory: z.boolean().default(false),
        approvedForFilm: z.boolean().default(false),
        createdAt: z.string().min(10).max(40),
        updatedAt: z.string().min(10).max(40),
      }),
    )
    .max(40)
    .default([]),
  /** Signed-in account that owns this tribute. Null only for unsigned local drafts. */
  ownerAccountId: z
    .string()
    .regex(/^acc_[a-f0-9]{16}$/)
    .nullable()
    .default(null),
  openingTitle: z.string().max(180).default(''),
  enhancementConsentLocal: z.boolean().default(false),
  enhancementRequests: z
    .array(
      z.object({
        id: z.string().min(8).max(80),
        memoryId: z.string().min(8).max(80),
        status: z.enum(['queued', 'processing', 'ready_local', 'unavailable', 'rejected']),
        note: z.string().max(200).default(''),
        variantPath: z.string().max(240).nullable().default(null),
        /** Family approved this local pixel-ops variant for film TimelineContract bind. */
        approvedForFilm: z.boolean().default(false),
        createdAt: z.string().min(10).max(40),
        updatedAt: z.string().min(10).max(40),
      }),
    )
    .max(100)
    .default([]),
  storyChapters: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        title: z.string().trim().min(1).max(120),
        yearHint: z.string().max(16).default(''),
        memoryIds: z.array(z.string()).max(80).default([]),
      }),
    )
    .max(40)
    .default([]),
  timeline: z.unknown().nullable().default(null),
  /** Optimistic concurrency for Guided/Studio autosave. */
  timelineVersion: z.number().int().nonnegative().default(0),
  /** Previous TimelineContract for one-step undo. */
  timelinePrevious: z.unknown().nullable().default(null),
  finalRendersUsed: z.number().int().nonnegative().default(0),
  entitlement: z
    .object({
      packageKey: z.literal(MEMORIAL_PACK_PACKAGE_KEY),
      grantedAt: z.string().min(10).max(40),
      source: z.enum(['local_fake', 'stripe']),
      /** Stripe order idempotency key when source is stripe. */
      orderId: z.string().min(8).max(80).optional(),
    })
    .nullable()
    .default(null),
  isFixtureSeed: z.boolean().default(false),
  createdAt: z.string().min(10).max(40),
  updatedAt: z.string().min(10).max(40),
});

export type Tribute = z.infer<typeof tributeSchema> & {
  timeline: TimelineContract | null;
  timelinePrevious: TimelineContract | null;
  guidedAudioPending: AudioMixContract | null;
};

export type CreatorPersonProfile = Tribute['peopleProfiles'][number];

/** Creator-local Stripe Checkout order (PENDING until webhook). */
export const checkoutOrderSchema = z.object({
  orderId: z.string().min(8).max(80),
  projectPublicId: z.string().regex(/^mv_[a-f0-9]{16}$/i),
  packageKey: z.literal(MEMORIAL_PACK_PACKAGE_KEY),
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'DISPUTED', 'PARTIALLY_REFUNDED']),
  providerCheckoutId: z.string().max(120).nullable().default(null),
  createdAt: z.string().min(10).max(40),
  paidAt: z.string().min(10).max(40).nullable().default(null),
});

export type CheckoutOrder = z.infer<typeof checkoutOrderSchema>;

export const paymentEventSchema = z.object({
  providerEventId: z.string().min(8).max(120),
  eventType: z.string().min(4).max(80),
  orderId: z.string().min(8).max(80),
  processedAt: z.string().min(10).max(40),
});

export type StoredPaymentEvent = z.infer<typeof paymentEventSchema>;

export const accountSchema = z.object({
  id: z.string().regex(/^acc_[a-f0-9]{16}$/),
  emailHash: z.string().regex(/^[a-f0-9]{64}$/),
  passwordHash: z.string().min(20).max(300),
  createdAt: z.string().min(10).max(40),
});

export type CreatorAccount = z.infer<typeof accountSchema>;

const storeSchema = z.object({
  version: z.literal(5),
  tributes: z.record(z.string(), tributeSchema),
  guestSessions: z.record(z.string(), guestSessionSchema).default({}),
  orders: z.record(z.string(), checkoutOrderSchema).default({}),
  paymentEvents: z.record(z.string(), paymentEventSchema).default({}),
  accounts: z.record(z.string(), accountSchema).default({}),
});

export type CreatorStore = z.infer<typeof storeSchema>;

const ACTIVE_COOKIE = 'mv_creator_tribute';
const GUEST_COOKIE = 'mv_creator_guest';

export function activeTributeCookieName(): string {
  return ACTIVE_COOKIE;
}

export function guestSessionCookieName(): string {
  return GUEST_COOKIE;
}

export async function loadCreatorStore(): Promise<CreatorStore> {
  return readStore();
}

export async function saveCreatorStore(store: CreatorStore): Promise<void> {
  await writeStore(store);
}

function storeDir(): string {
  return path.join(process.cwd(), '.data');
}

function storePath(): string {
  return path.join(storeDir(), 'creator-store.json');
}

function emptyStore(): CreatorStore {
  return { version: 5, tributes: {}, guestSessions: {}, orders: {}, paymentEvents: {}, accounts: {} };
}

function migrateMemory(raw: Record<string, unknown>): MemoryAsset {
  if (typeof raw.ingestStatus === 'string') {
    return memoryAssetSchema.parse({
      source: 'owner',
      reviewState: 'accepted',
      ...raw,
    });
  }
  // v1: status was UI-facing
  const ui = typeof raw.status === 'string' ? raw.status : 'ready';
  const ingestStatus: AssetStatus =
    ui === 'uploading'
      ? 'UPLOADING'
      : ui === 'processing'
        ? 'PROCESSING'
        : ui === 'needs_attention'
          ? 'REJECTED'
          : 'READY';
  const now = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  return memoryAssetSchema.parse({
    id: raw.id,
    title: raw.title,
    year: raw.year ?? '',
    ingestStatus,
    failureCode: null,
    imagePath: raw.imagePath,
    source: 'owner',
    reviewState: 'accepted',
    createdAt: now,
    updatedAt: now,
  });
}

function migrateTribute(raw: Record<string, unknown>): Tribute {
  const memoriesRaw = Array.isArray(raw.memories) ? raw.memories : [];
  const memories = memoriesRaw.map((m) => migrateMemory(m as Record<string, unknown>));
  const invitesRaw = Array.isArray(raw.invites) ? raw.invites : [];
  const sharesRaw = Array.isArray(raw.shares) ? raw.shares : [];
  const renderJobsRaw = Array.isArray(raw.renderJobs) ? raw.renderJobs : [];
  const membersRaw = Array.isArray(raw.members) ? raw.members : [];
  const activityRaw = Array.isArray(raw.activity) ? raw.activity : [];
  const ownerLabel =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? 'Owner'
      : 'Owner';
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  const defaultMembers =
    membersRaw.length > 0
      ? membersRaw
      : [
          {
            id: `mbr_owner_${String(raw.publicId ?? 'x').slice(-8)}`,
            label: ownerLabel,
            role: 'owner',
            status: 'active',
            createdAt,
            updatedAt: createdAt,
          },
        ];
  const parsed = tributeSchema.parse({
    ...raw,
    collectionStatus: raw.collectionStatus ?? 'NOT_STARTED',
    memories,
    invites: invitesRaw,
    shares: sharesRaw,
    renderJobs: renderJobsRaw,
    members: defaultMembers,
    activity: activityRaw,
    placementSuggestions: Array.isArray(raw.placementSuggestions) ? raw.placementSuggestions : [],
    collaborationDecisions: Array.isArray(raw.collaborationDecisions)
      ? raw.collaborationDecisions
      : [],
    collaborationTasks: Array.isArray(raw.collaborationTasks) ? raw.collaborationTasks : [],
    ceremonyChecklist: raw.ceremonyChecklist ?? {
      downloadDevice: false,
      testVenue: false,
      soundtrackCleared: false,
      updatedAt: null,
    },
    timeline: raw.timeline ?? null,
    timelinePrevious: raw.timelinePrevious ?? null,
    timelineVersion: typeof raw.timelineVersion === 'number' ? raw.timelineVersion : raw.timeline ? 1 : 0,
    finalRendersUsed: typeof raw.finalRendersUsed === 'number' ? raw.finalRendersUsed : 0,
  });
  return {
    ...parsed,
    timeline: (parsed.timeline as TimelineContract | null) ?? null,
    timelinePrevious: (parsed.timelinePrevious as TimelineContract | null) ?? null,
    guidedAudioPending: (parsed.guidedAudioPending as AudioMixContract | null) ?? null,
  };
}

function parseStoreDocument(rawText: string): CreatorStore {
  const raw = JSON.parse(rawText) as {
    version?: number;
    tributes?: Record<string, Record<string, unknown>>;
    guestSessions?: Record<string, unknown>;
    orders?: Record<string, unknown>;
    paymentEvents?: Record<string, unknown>;
    accounts?: Record<string, unknown>;
  };
  const tributes: Record<string, z.infer<typeof tributeSchema>> = {};
  for (const [id, tribute] of Object.entries(raw.tributes ?? {})) {
    tributes[id] = migrateTribute(tribute);
  }
  const guestSessions: Record<string, GuestSession> = {};
  for (const [id, session] of Object.entries(raw.guestSessions ?? {})) {
    const parsed = guestSessionSchema.safeParse(session);
    if (parsed.success) {
      guestSessions[id] = parsed.data;
    }
  }
  const orders: Record<string, CheckoutOrder> = {};
  for (const [id, order] of Object.entries(raw.orders ?? {})) {
    const parsed = checkoutOrderSchema.safeParse(order);
    if (parsed.success) {
      orders[id] = parsed.data;
    }
  }
  const paymentEvents: Record<string, StoredPaymentEvent> = {};
  for (const [id, event] of Object.entries(raw.paymentEvents ?? {})) {
    const parsed = paymentEventSchema.safeParse(event);
    if (parsed.success) {
      paymentEvents[id] = parsed.data;
    }
  }
  const accounts: Record<string, CreatorAccount> = {};
  for (const [id, account] of Object.entries(raw.accounts ?? {})) {
    const parsed = accountSchema.safeParse(account);
    if (parsed.success) {
      accounts[id] = parsed.data;
    }
  }
  return storeSchema.parse({ version: 5, tributes, guestSessions, orders, paymentEvents, accounts });
}

async function readStoreUnscoped(): Promise<CreatorStore> {
  const persistence = await resolvePersistence();
  try {
    if (persistence.kind === 'database') {
      const { readSqlDocument } = await import('./sql-store');
      const document = await readSqlDocument();
      if (!document) {
        return emptyStore();
      }
      return parseStoreDocument(document);
    }
    if (persistence.kind === 'vercel_kv') {
      const document = await readKvStoreDocument();
      if (!document) {
        return emptyStore();
      }
      return parseStoreDocument(document);
    }
    const rawText = await readFile(storePath(), 'utf8');
    return parseStoreDocument(rawText);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      throw error;
    }
    return emptyStore();
  }
}

async function readStore(): Promise<CreatorStore> {
  const store = await readStoreUnscoped();
  const actor = currentAccountId();
  if (!actor) {
    return store;
  }
  const tributes: CreatorStore['tributes'] = {};
  for (const [id, tribute] of Object.entries(store.tributes)) {
    if (tribute.ownerAccountId === actor) {
      tributes[id] = tribute;
    }
  }
  return { ...store, tributes };
}

async function persistStore(store: CreatorStore): Promise<void> {
  const persistence = await assertPersistenceWritable();
  const payload = `${JSON.stringify(storeSchema.parse(store), null, 2)}\n`;
  if (persistence.kind === 'database') {
    const { writeSqlDocument } = await import('./sql-store');
    await writeSqlDocument(payload);
    return;
  }
  if (persistence.kind === 'vercel_kv') {
    await writeKvStoreDocument(payload);
    return;
  }
  try {
    await mkdir(storeDir(), { recursive: true });
    const target = storePath();
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, target);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      throw error;
    }
    throw new PersistenceUnavailableError(
      'Local file persistence is not writable on this host.',
      { kind: 'unavailable', xb012: true },
    );
  }
}

async function writeStore(store: CreatorStore): Promise<void> {
  const actor = currentAccountId();
  if (!actor) {
    await persistStore(store);
    return;
  }
  const persisted = await readStoreUnscoped();
  const tributes = { ...persisted.tributes };
  for (const [id, tribute] of Object.entries(tributes)) {
    if (tribute.ownerAccountId === actor) {
      delete tributes[id];
    }
  }
  for (const [id, tribute] of Object.entries(store.tributes)) {
    if (tribute.ownerAccountId === actor) {
      tributes[id] = tribute;
    }
  }
  await persistStore({ ...store, tributes });
}

export type CreateTributeInput = {
  displayName: string;
  bornLabel?: string;
  rememberedLabel?: string;
  about?: string;
  ownerInitial?: string;
};

export async function createTribute(input: CreateTributeInput): Promise<Tribute> {
  const now = new Date().toISOString();
  const publicId = createProjectPublicId();
  if (!isProjectPublicId(publicId)) {
    throw new Error('invalid_public_id');
  }
  const tribute = migrateTribute(
    tributeSchema.parse({
      publicId,
      displayName: input.displayName.trim(),
      bornLabel: input.bornLabel?.trim() ?? '',
      rememberedLabel: input.rememberedLabel?.trim() ?? '',
      about: input.about?.trim() ?? '',
      ownerInitial: (input.ownerInitial?.trim() || 'Y').slice(0, 2).toUpperCase(),
      themeKey: 'timeless',
      firstFilmStage: 'idle',
      memories: [],
      invites: [],
      shares: [],
      renderJobs: [],
      members: [
        {
          id: `mbr_owner_${publicId.slice(-8)}`,
          label: 'Owner',
          role: 'owner',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      activity: [
        {
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'tribute_created',
          createdAt: now,
        },
      ],
      ceremonyChecklist: {
        downloadDevice: false,
        testVenue: false,
        soundtrackCleared: false,
        updatedAt: null,
      },
      timeline: null,
      timelinePrevious: null,
      timelineVersion: 0,
      finalRendersUsed: 0,
      entitlement: null,
      ownerAccountId: currentAccountId(),
      isFixtureSeed: false,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const store = await readStore();
  store.tributes[publicId] = tribute;
  await writeStore(store);
  return tribute;
}

export async function getTribute(publicId: string): Promise<Tribute | null> {
  if (!isProjectPublicId(publicId)) {
    return null;
  }
  const store = await readStore();
  const tribute = store.tributes[publicId];
  if (!tribute) {
    return null;
  }
  const migrated = migrateTribute(tribute as unknown as Record<string, unknown>);
  if (!actorAllowsTribute(migrated.ownerAccountId)) {
    return null;
  }
  return migrated;
}

export async function listTributes(): Promise<Tribute[]> {
  const store = await readStore();
  return Object.values(store.tributes)
    .map((t) => migrateTribute(t as unknown as Record<string, unknown>))
    .filter((tribute) => actorAllowsTribute(tribute.ownerAccountId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateTribute(
  publicId: string,
  patch: Partial<
    Pick<
      Tribute,
      | 'displayName'
      | 'bornLabel'
      | 'rememberedLabel'
      | 'about'
      | 'themeKey'
      | 'locale'
      | 'firstFilmStage'
      | 'soundtrackTrackId'
      | 'musicRightsConfirmed'
      | 'ceremonyMusicPlan'
      | 'openingTitle'
      | 'enhancementConsentLocal'
      | 'storyChapters'
    >
  >,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const filmChoiceTouched =
    patch.themeKey !== undefined ||
    patch.openingTitle !== undefined ||
    patch.soundtrackTrackId !== undefined ||
    patch.musicRightsConfirmed !== undefined ||
    patch.displayName !== undefined ||
    patch.locale !== undefined;
  let timeline = existing.timeline as TimelineContract | null;
  let timelineVersion = existing.timelineVersion;
  let timelinePrevious = existing.timelinePrevious;
  if (filmChoiceTouched && timeline) {
    const merged = migrateTribute(
      tributeSchema.parse({
        ...existing,
        ...patch,
      }) as unknown as Record<string, unknown>,
    );
    timelinePrevious = timeline;
    timeline = applyFilmChoicesToTimeline(timeline, {
      themeKey: merged.themeKey,
      openingTitle: merged.openingTitle,
      displayName: merged.displayName,
      soundtrackTrackId: merged.soundtrackTrackId,
      musicRightsConfirmed: merged.musicRightsConfirmed,
      locale: merged.locale,
      entitlement: merged.entitlement,
    });
    timelineVersion = existing.timelineVersion + 1;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      ...patch,
      timeline,
      timelinePrevious,
      timelineVersion,
      updatedAt: new Date().toISOString(),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

/**
 * Atomically persist a Ceremony Music plan onto the TimelineContract AudioMix.
 * Single version bump — avoids film-choice rewrite racing with saveTimeline.
 */
export async function persistCeremonyMusicApply(input: {
  publicId: string;
  plan: CeremonyMusicPlan;
  timeline: TimelineContract;
  soundtrackTrackId: string | null;
}): Promise<
  | { ok: true; tribute: Tribute }
  | { ok: false; reason: 'not_found' }
> {
  const store = await readStore();
  const existing = store.tributes[input.publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      ceremonyMusicPlan: input.plan,
      soundtrackTrackId: input.soundtrackTrackId,
      musicRightsConfirmed: true,
      timeline: input.timeline,
      timelinePrevious: current.timeline,
      timelineVersion: current.timelineVersion + 1,
      updatedAt: now,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'ceremony_music_applied',
          correlationId: hashTimeline(input.timeline).slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[input.publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export async function persistGuidedAudioPending(
  publicId: string,
  mix: AudioMixContract,
): Promise<{ ok: true; tribute: Tribute } | { ok: false; reason: 'not_found' }> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      guidedAudioPending: mix,
      updatedAt: new Date().toISOString(),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export async function persistGuidedAudioApply(input: {
  publicId: string;
  timeline: TimelineContract;
}): Promise<{ ok: true; tribute: Tribute } | { ok: false; reason: 'not_found' }> {
  const store = await readStore();
  const existing = store.tributes[input.publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      timeline: input.timeline,
      timelinePrevious: current.timeline,
      timelineVersion: current.timelineVersion + 1,
      guidedAudioPending: null,
      updatedAt: now,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'guided_audio_applied',
          correlationId: hashTimeline(input.timeline).slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[input.publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

function defaultPeopleConsent(tributePublicId: string): PeopleConsent {
  return peopleConsentSchema.parse({
    schemaVersion: 1,
    tributePublicId,
    state: 'disabled',
    localApproved: false,
    externalApproved: false,
    policyVersion: 'people-intelligence-v1',
    retainFamilyLabelsOnDeletion: false,
    version: 0,
    changeTimeline: false,
  });
}

export function peopleConsentFor(tribute: Tribute): PeopleConsent {
  if (tribute.peopleConsent) {
    return peopleConsentSchema.parse(tribute.peopleConsent);
  }
  return defaultPeopleConsent(tribute.publicId);
}

export function peopleIntelOverview(tribute: Tribute) {
  const consent = peopleConsentFor(tribute);
  return {
    consent: {
      state: consent.state,
      localApproved: consent.localApproved,
      externalApproved: consent.externalApproved,
      version: consent.version,
    },
    processingAllowed: peopleProcessingAllowed(consent),
    detectionEngine: {
      available: false as const,
      status: 'not_wired_in_creator' as const,
      note: 'Face detection / embeddings are not COMPLETE in apps/creator. Manual family labels only. Production biometric legal review remains XB-010.',
    },
    profiles: tribute.peopleProfiles,
    clusters: [] as const,
    observations: [] as const,
    jobs: [] as const,
  };
}

export async function updatePeopleConsent(
  publicId: string,
  action: 'grant_local' | 'revoke' | 'delete_derived',
  expectedVersion?: number,
): Promise<
  | { ok: true; tribute: Tribute; overview: ReturnType<typeof peopleIntelOverview> }
  | { ok: false; reason: 'not_found' | 'conflict' }
> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const consent = peopleConsentFor(current);
  if (expectedVersion !== undefined && expectedVersion !== consent.version) {
    return { ok: false, reason: 'conflict' };
  }
  const now = new Date().toISOString();
  let nextConsent: PeopleConsent;
  let profiles = current.peopleProfiles;
  if (action === 'grant_local') {
    nextConsent = peopleConsentSchema.parse({
      ...consent,
      state: 'local_approved',
      localApproved: true,
      externalApproved: false,
      approvedAt: now,
      revokedAt: undefined,
      version: consent.version + 1,
    });
  } else if (action === 'revoke') {
    nextConsent = peopleConsentSchema.parse({
      ...consent,
      state: 'revoked',
      localApproved: false,
      externalApproved: false,
      revokedAt: now,
      version: consent.version + 1,
    });
  } else {
    nextConsent = peopleConsentSchema.parse({
      ...consent,
      state: 'disabled',
      localApproved: false,
      externalApproved: false,
      retainFamilyLabelsOnDeletion: true,
      version: consent.version + 1,
    });
    // Derived face data would be wiped here — creator has none. Keep family labels.
    profiles = current.peopleProfiles;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      peopleConsent: nextConsent,
      peopleProfiles: profiles,
      updatedAt: now,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'people_consent_updated',
          correlationId: action.slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next, overview: peopleIntelOverview(next) };
}

export async function upsertPeopleProfile(
  publicId: string,
  input: { displayLabel: string; approvedForStory?: boolean; approvedForFilm?: boolean },
): Promise<
  | { ok: true; tribute: Tribute; overview: ReturnType<typeof peopleIntelOverview> }
  | { ok: false; reason: 'not_found' | 'consent_required' | 'invalid_label' }
> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  if (!peopleProcessingAllowed(peopleConsentFor(current))) {
    return { ok: false, reason: 'consent_required' };
  }
  const label = sanitizePersonLabel(input.displayLabel);
  if (!label) {
    return { ok: false, reason: 'invalid_label' };
  }
  const now = new Date().toISOString();
  const profile = {
    id: `ppl_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    displayLabel: label,
    approvedForStory: Boolean(input.approvedForStory),
    approvedForFilm: Boolean(input.approvedForFilm),
    createdAt: now,
    updatedAt: now,
  };
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      peopleProfiles: [profile, ...current.peopleProfiles].slice(0, 40),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next, overview: peopleIntelOverview(next) };
}

export type AddMemoryInput = {
  id?: string;
  title: string;
  year?: string;
  imagePath?: string;
  filename?: string;
  contentType?: string;
  byteSize?: number;
  rightsConfirmed?: boolean;
  durationMs?: number;
  /** When true, start as READY (fixture/local sample after job complete). Default starts UPLOADING. */
  alreadyReady?: boolean;
  /** Start as PENDING_UPLOAD awaiting TUS bytes. */
  awaitBytes?: boolean;
  source?: 'owner' | 'contributor';
  contributorName?: string;
  contributorNote?: string;
  inviteId?: string;
  reviewState?: 'pending' | 'accepted' | 'declined';
};

export async function addMemory(publicId: string, input: AddMemoryInput): Promise<MemoryAsset | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  const filename = input.filename?.trim() ?? '';
  const heic = filename ? isHeicFilename(filename) : false;
  const source = input.source ?? 'owner';

  let ingestStatus: AssetStatus = input.alreadyReady
    ? 'READY'
    : input.awaitBytes
      ? 'PENDING_UPLOAD'
      : 'UPLOADING';
  let failureCode: AssetUiFailureCode | null = null;
  if (heic) {
    ingestStatus = 'REJECTED';
    failureCode = 'heic';
  }

  const memory = memoryAssetSchema.parse({
    id:
      input.id && /^mem_[a-f0-9]{16}$/.test(input.id)
        ? input.id
        : `mem_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    title: input.title.trim(),
    year: input.year?.trim() ?? '',
    ingestStatus,
    failureCode,
    imagePath: input.imagePath?.trim() || '/fixtures/memory-a.png',
    contentType: input.contentType?.trim().slice(0, 120) || undefined,
    rightsConfirmed: input.rightsConfirmed === true ? true : undefined,
    durationMs:
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : undefined,
    originalFilenameHint: filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) : undefined,
    source,
    contributorName: input.contributorName?.trim().slice(0, 40) || undefined,
    contributorNote: input.contributorNote?.trim().slice(0, 280) || undefined,
    inviteId: input.inviteId,
    reviewState: input.reviewState ?? (source === 'contributor' ? 'pending' : 'accepted'),
    createdAt: now,
    updatedAt: now,
  });
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories: [memory, ...existing.memories],
      updatedAt: now,
      firstFilmStage: existing.firstFilmStage === 'idle' ? 'preparing_memories' : existing.firstFilmStage,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'memory_added',
          correlationId: memory.id.slice(0, 16),
          createdAt: now,
        }),
        ...existing.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return memory;
}

/**
 * Advance pending ingest jobs one step (worker:once / poll). No setTimeout.
 */
export async function advanceIngestJobs(publicId: string): Promise<{
  tribute: Tribute | null;
  advanced: number;
}> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { tribute: null, advanced: 0 };
  }
  let advanced = 0;
  const now = new Date().toISOString();
  const memories = existing.memories.map((memory) => {
    if (isIngestTerminal(memory.ingestStatus)) {
      return memory;
    }
    const nextStatus = nextIngestStatus(memory.ingestStatus);
    if (!nextStatus) {
      return memory;
    }
    advanced += 1;
    return memoryAssetSchema.parse({
      ...memory,
      ingestStatus: nextStatus,
      updatedAt: now,
    });
  });
  if (advanced === 0) {
    return { tribute: migrateTribute(existing as unknown as Record<string, unknown>), advanced: 0 };
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { tribute: next, advanced };
}

export async function attachMemoryBytes(
  publicId: string,
  memoryId: string,
  input: { imagePath: string; contentType?: string; durationMs?: number; checksumSha256?: string },
): Promise<MemoryAsset | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let updated: MemoryAsset | null = null;
  const memories = existing.memories.map((memory) => {
    if (memory.id !== memoryId) {
      return memory;
    }
    if (memory.failureCode === 'heic') {
      return memory;
    }
    updated = memoryAssetSchema.parse({
      ...memory,
      imagePath: input.imagePath,
      contentType: input.contentType?.trim().slice(0, 120) || memory.contentType,
      checksumSha256: input.checksumSha256 ?? memory.checksumSha256,
      durationMs:
        typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
          ? Math.max(0, Math.round(input.durationMs))
          : memory.durationMs,
      ingestStatus:
        memory.ingestStatus === 'PENDING_UPLOAD' || memory.ingestStatus === 'UPLOADING'
          ? 'UPLOADED'
          : memory.ingestStatus,
      updatedAt: now,
    });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

export async function markMemoryRejected(publicId: string, memoryId: string): Promise<MemoryAsset | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let updated: MemoryAsset | null = null;
  const memories = existing.memories.map((memory) => {
    if (memory.id !== memoryId) {
      return memory;
    }
    updated = memoryAssetSchema.parse({
      ...memory,
      ingestStatus: 'REJECTED',
      failureCode: 'rejected',
      imagePath: '',
      updatedAt: now,
    });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

export type SaveTimelineResult =
  | { ok: true; tribute: Tribute }
  | { ok: false; reason: 'not_found' | 'missing_revision' | 'conflict'; timelineVersion: number; updatedAt: string };

/**
 * Persist TimelineContract with optimistic concurrency (Prompt 21).
 * Requires expectedVersion; never silently overwrites a newer revision.
 */
export async function saveTimeline(
  publicId: string,
  timeline: TimelineContract,
  input: { expectedVersion?: number; clientUpdatedAt?: string } = {},
): Promise<SaveTimelineResult> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found', timelineVersion: 0, updatedAt: '' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const publish = planTimelinePublish({
    currentVersion: current.timelineVersion,
    expectedVersion: input.expectedVersion,
  });
  if (publish.action === 'conflict') {
    return {
      ok: false,
      reason: 'conflict',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  if (input.expectedVersion === undefined) {
    return {
      ok: false,
      reason: 'missing_revision',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  const autosave = planAutosaveWrite({
    clientUpdatedAt: input.clientUpdatedAt ?? current.updatedAt,
    serverUpdatedAt: current.updatedAt,
    requireClientRevision: Boolean(input.clientUpdatedAt),
  });
  if (autosave.action === 'reject') {
    return {
      ok: false,
      reason: 'missing_revision',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  if (autosave.action === 'conflict') {
    return {
      ok: false,
      reason: 'conflict',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  const now = new Date().toISOString();
  const previous = current.timeline;
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      timeline,
      timelinePrevious: previous,
      timelineVersion: publish.nextVersion,
      updatedAt: now,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'timeline_edited',
          correlationId: hashTimeline(timeline).slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export async function undoTimeline(
  publicId: string,
  expectedVersion: number,
): Promise<SaveTimelineResult> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found', timelineVersion: 0, updatedAt: '' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const publish = planTimelinePublish({
    currentVersion: current.timelineVersion,
    expectedVersion,
  });
  if (publish.action === 'conflict') {
    return {
      ok: false,
      reason: 'conflict',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  if (!current.timelinePrevious) {
    return {
      ok: false,
      reason: 'conflict',
      timelineVersion: current.timelineVersion,
      updatedAt: current.updatedAt,
    };
  }
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      timeline: current.timelinePrevious,
      timelinePrevious: null,
      timelineVersion: publish.nextVersion,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export async function retryFailedMemory(
  publicId: string,
  memoryId: string,
): Promise<MemoryAsset | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let updated: MemoryAsset | null = null;
  const memories = existing.memories.map((memory) => {
    if (memory.id !== memoryId) {
      return memory;
    }
    if (memory.failureCode === 'heic') {
      return memory; // HEIC: no retry
    }
    if (memory.ingestStatus !== 'FAILED_RETRYABLE' && memory.ingestStatus !== 'FAILED_FINAL') {
      return memory;
    }
    updated = memoryAssetSchema.parse({
      ...memory,
      ingestStatus: 'UPLOADING',
      failureCode: null,
      updatedAt: now,
    });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

/** Minimum ready memories before Arrange can leave preparing_memories. */
export const FIRST_FILM_READY_PHOTO_THRESHOLD = 3;

export type FirstFilmStage =
  | 'idle'
  | 'preparing_memories'
  | 'building_story'
  | 'arranging_film'
  | 'finishing'
  | 'ready_to_review'
  | 'blocked';

/**
 * Explicit, durable first-film stage advance — no setTimeout fake processing.
 * On ready_to_review, publishes a validated TimelineContract snapshot.
 */
export async function advanceFirstFilm(
  publicId: string,
): Promise<
  | { ok: true; tribute: Tribute; stage: FirstFilmStage }
  | { ok: false; reason: 'not_found' | 'need_more_memories' | 'already_ready' | 'blocked' }
> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  if (existing.firstFilmStage === 'blocked') {
    return { ok: false, reason: 'blocked' };
  }
  if (existing.firstFilmStage === 'ready_to_review') {
    return { ok: false, reason: 'already_ready' };
  }
  const readyCount = existing.memories.filter((m) => m.ingestStatus === 'READY').length;
  if (readyCount < FIRST_FILM_READY_PHOTO_THRESHOLD) {
    return { ok: false, reason: 'need_more_memories' };
  }

  const transitions: Record<string, FirstFilmStage> = {
    idle: 'preparing_memories',
    preparing_memories: 'building_story',
    building_story: 'arranging_film',
    arranging_film: 'finishing',
    finishing: 'ready_to_review',
  };
  const nextStage = transitions[existing.firstFilmStage] ?? 'preparing_memories';
  const now = new Date().toISOString();
  let timeline = existing.timeline as TimelineContract | null;
  let timelineVersion = existing.timelineVersion;
  let timelinePrevious = existing.timelinePrevious;
  if (nextStage === 'ready_to_review') {
    const draft = migrateTribute(existing as unknown as Record<string, unknown>);
    timelinePrevious = existing.timeline;
    timeline = buildTimelineFromTribute(draft);
    // Attach AudioMix when soundtrack + rights already chosen (ceremony music path).
    if (timeline && draft.soundtrackTrackId && draft.musicRightsConfirmed) {
      try {
        const { applyCeremonyMusicToTimeline, planFromSoundtrack, parseStoredCeremonyMusicPlan } =
          await import('./ceremony-music-local');
        const plan =
          parseStoredCeremonyMusicPlan(draft.ceremonyMusicPlan) ??
          planFromSoundtrack(draft.soundtrackTrackId);
        timeline = applyCeremonyMusicToTimeline(timeline, plan);
      } catch {
        // Keep legacy music bed if mix propose fails — do not block first film.
      }
    }
    timelineVersion = existing.timelineVersion + 1;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      firstFilmStage: nextStage,
      timeline,
      timelinePrevious,
      timelineVersion,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next, stage: nextStage };
}

export function firstFilmProgress(stage: FirstFilmStage): {
  width: string;
  label: string;
  organised: boolean;
  prepared: boolean;
  finishing: boolean;
} {
  switch (stage) {
    case 'ready_to_review':
      return { width: '100%', label: 'Ready to review', organised: true, prepared: true, finishing: true };
    case 'finishing':
      return { width: '85%', label: 'Adding finishing touches', organised: true, prepared: true, finishing: false };
    case 'arranging_film':
      return { width: '64%', label: 'Preparing the scenes', organised: true, prepared: true, finishing: false };
    case 'building_story':
      return { width: '45%', label: 'Building the story', organised: true, prepared: false, finishing: false };
    case 'preparing_memories':
      return { width: '28%', label: 'Organising memories', organised: false, prepared: false, finishing: false };
    default:
      return { width: '10%', label: 'Waiting to begin', organised: false, prepared: false, finishing: false };
  }
}

export type EntitlementView = {
  active: boolean;
  packageKey: typeof MEMORIAL_PACK_PACKAGE_KEY | null;
  maxFinalRenders: number;
  retentionDays: number;
  allowsPrivatePlayback: boolean;
  source: 'local_fake' | 'stripe' | null;
};

export function entitlementView(tribute: Tribute | null): EntitlementView {
  const policy = memorialPackPolicy();
  if (!tribute?.entitlement) {
    return {
      active: false,
      packageKey: null,
      maxFinalRenders: policy.maxFinalRenders,
      retentionDays: policy.retentionDays,
      allowsPrivatePlayback: false,
      source: null,
    };
  }
  return {
    active: true,
    packageKey: tribute.entitlement.packageKey,
    maxFinalRenders: policy.maxFinalRenders,
    retentionDays: policy.retentionDays,
    allowsPrivatePlayback: policy.allowsPrivatePlayback,
    source: tribute.entitlement.source,
  };
}

export async function fulfillLocalMemorialPack(publicId: string): Promise<
  | { ok: true; tribute: Tribute }
  | { ok: false; reason: 'not_local' | 'not_found' | 'already_active' }
> {
  const env = creatorEnv();
  if (!canFulfillLocalFakeCheckout(env.APP_ENV)) {
    return { ok: false, reason: 'not_local' };
  }
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  if (existing.entitlement) {
    return { ok: false, reason: 'already_active' };
  }
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      entitlement: {
        packageKey: MEMORIAL_PACK_PACKAGE_KEY,
        grantedAt: now,
        source: 'local_fake',
      },
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'pack_fulfilled',
          createdAt: now,
        }),
        ...existing.activity,
      ].slice(0, 200),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export async function createPendingCheckoutOrder(input: {
  orderId: string;
  projectPublicId: string;
}): Promise<
  | { ok: true; order: CheckoutOrder; alreadyPaid: boolean }
  | { ok: false; reason: 'not_found' | 'invalid_package' }
> {
  const store = await readStore();
  const tribute = store.tributes[input.projectPublicId];
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  const existing = store.orders[input.orderId];
  if (existing) {
    return { ok: true, order: existing, alreadyPaid: existing.status === 'PAID' };
  }
  const now = new Date().toISOString();
  const order = checkoutOrderSchema.parse({
    orderId: input.orderId,
    projectPublicId: input.projectPublicId,
    packageKey: MEMORIAL_PACK_PACKAGE_KEY,
    status: 'PENDING',
    providerCheckoutId: null,
    createdAt: now,
    paidAt: null,
  });
  store.orders[input.orderId] = order;
  await writeStore(store);
  return { ok: true, order, alreadyPaid: false };
}

export async function attachCheckoutSessionId(
  orderId: string,
  providerCheckoutId: string,
): Promise<CheckoutOrder | null> {
  const store = await readStore();
  const order = store.orders[orderId];
  if (!order) {
    return null;
  }
  const next = checkoutOrderSchema.parse({
    ...order,
    providerCheckoutId,
  });
  store.orders[orderId] = next;
  await writeStore(store);
  return next;
}

/**
 * Idempotent Stripe webhook fulfillment — grants Memorial Pack via domain ceremony policy.
 * Never grants from browser redirect alone.
 */
export async function applyStripeCheckoutCommerce(input: {
  providerEventId: string;
  eventType: CommerceEventType;
  orderId: string;
  projectPublicId?: string | null;
  providerCheckoutId?: string | null;
}): Promise<
  | { ok: true; orderStatus: string; duplicate?: boolean }
  | { ok: false; reason: 'not_found' | 'persist_failed' }
> {
  const store = await readStore();
  if (store.paymentEvents[input.providerEventId]) {
    const order = store.orders[input.orderId];
    return { ok: true, orderStatus: order?.status ?? 'duplicate', duplicate: true };
  }
  let order = store.orders[input.orderId];
  if (!order) {
    const projectPublicId = input.projectPublicId;
    if (!projectPublicId || !store.tributes[projectPublicId]) {
      return { ok: false, reason: 'not_found' };
    }
    const now = new Date().toISOString();
    order = checkoutOrderSchema.parse({
      orderId: input.orderId,
      projectPublicId,
      packageKey: MEMORIAL_PACK_PACKAGE_KEY,
      status: 'PENDING',
      providerCheckoutId: input.providerCheckoutId ?? null,
      createdAt: now,
      paidAt: null,
    });
    store.orders[input.orderId] = order;
  }

  const nextStatus = nextOrderStatus(order.status, input.eventType);
  const now = new Date().toISOString();
  store.paymentEvents[input.providerEventId] = paymentEventSchema.parse({
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    orderId: input.orderId,
    processedAt: now,
  });
  store.orders[input.orderId] = checkoutOrderSchema.parse({
    ...order,
    status: nextStatus,
    providerCheckoutId: input.providerCheckoutId ?? order.providerCheckoutId,
    paidAt: nextStatus === 'PAID' ? now : order.paidAt,
  });

  const tribute = store.tributes[order.projectPublicId];
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }

  if (input.eventType === 'checkout.completed' && nextStatus === 'PAID') {
    if (!tribute.entitlement) {
      store.tributes[order.projectPublicId] = migrateTribute(
        tributeSchema.parse({
          ...tribute,
          entitlement: {
            packageKey: MEMORIAL_PACK_PACKAGE_KEY,
            grantedAt: now,
            source: 'stripe',
            orderId: input.orderId,
          },
          activity: [
            activityEventSchema.parse({
              id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
              code: 'pack_fulfilled',
              createdAt: now,
            }),
            ...tribute.activity,
          ].slice(0, 200),
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      );
    }
  } else if (shouldRevokeEntitlement(nextStatus)) {
    const current = store.tributes[order.projectPublicId];
    if (current?.entitlement?.source === 'stripe') {
      store.tributes[order.projectPublicId] = migrateTribute(
        tributeSchema.parse({
          ...current,
          entitlement: null,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      );
    }
  }

  await writeStore(store);
  return { ok: true, orderStatus: nextStatus };
}

/**
 * Eleanor fixture seed — local APP_ENV only. Never returned as a default production tribute.
 */
export async function seedEleanorFixture(): Promise<
  | { ok: true; tribute: Tribute }
  | { ok: false; reason: 'not_local' }
> {
  const env = creatorEnv();
  if (!canFulfillLocalFakeCheckout(env.APP_ENV)) {
    return { ok: false, reason: 'not_local' };
  }
  const now = new Date().toISOString();
  const publicId = createProjectPublicId();
  const memories: MemoryAsset[] = [
    { id: 'mem_fixture_b', title: 'A little girl with a big smile', year: '1948', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-b.png', source: 'owner', reviewState: 'accepted', createdAt: now, updatedAt: now },
    { id: 'mem_fixture_a', title: 'A day to remember', year: '1966', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-a.png', source: 'owner', reviewState: 'accepted', createdAt: now, updatedAt: now },
    { id: 'mem_fixture_f', title: 'Together from the start', year: '1971', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-f.png', source: 'owner', reviewState: 'accepted', createdAt: now, updatedAt: now },
    { id: 'mem_fixture_d', title: 'Summer with the family', year: '1988', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-d.png', source: 'contributor', contributorName: 'Sophie', reviewState: 'accepted', createdAt: now, updatedAt: now },
    { id: 'mem_fixture_e', title: 'Afternoons outdoors', year: '1996', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-e.png', source: 'owner', reviewState: 'accepted', createdAt: now, updatedAt: now },
    { id: 'mem_fixture_c', title: 'A favourite afternoon', year: '2018', ingestStatus: 'READY', failureCode: null, imagePath: '/fixtures/memory-c.png', source: 'owner', reviewState: 'accepted', createdAt: now, updatedAt: now },
  ];
  const draft = migrateTribute(
    tributeSchema.parse({
      publicId,
      displayName: 'Eleanor Williams',
      bornLabel: '1948',
      rememberedLabel: '2025',
      about: 'A loving mum, a wonderful grandmother, and someone who made every room feel warmer.',
      ownerInitial: 'S',
      themeKey: 'timeless',
      firstFilmStage: 'ready_to_review',
      collectionStatus: 'OPEN',
      memories,
      invites: [],
      shares: [],
      renderJobs: [],
      members: [
        {
          id: `mbr_owner_${publicId.slice(-8)}`,
          label: 'Owner',
          role: 'owner',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      activity: [
        {
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'tribute_created',
          createdAt: now,
        },
      ],
      ceremonyChecklist: {
        downloadDevice: false,
        testVenue: false,
        soundtrackCleared: false,
        updatedAt: null,
      },
      timeline: null,
      timelinePrevious: null,
      timelineVersion: 0,
      finalRendersUsed: 0,
      entitlement: null,
      isFixtureSeed: true,
      createdAt: now,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  const timeline = buildTimelineFromTribute(draft);
  const tribute = { ...draft, timeline, timelineVersion: 1 };
  const store = await readStore();
  store.tributes[publicId] = tribute;
  await writeStore(store);
  return { ok: true, tribute };
}

export function lifeSpanLabel(tribute: Tribute): string {
  return lifeSpanFromLabels(tribute);
}

export function memoryCount(tribute: Tribute): number {
  return tribute.memories.length;
}

export function readyMemoryCount(tribute: Tribute): number {
  return tribute.memories.filter((m) => m.ingestStatus === 'READY').length;
}

export function hasInFlightIngest(tribute: Tribute): boolean {
  return tribute.memories.some((m) => {
    const ui = mapAssetStatusToUi(m.ingestStatus);
    return ui === 'uploading' || ui === 'processing' || ui === 'queued';
  });
}

export async function persistContributorInvite(
  publicId: string,
  invite: StoredContributorInvite,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  // First invite opens collection; never silently reopen a LOCKED collection.
  const collectionStatus =
    existing.collectionStatus === 'NOT_STARTED' ? 'OPEN' : existing.collectionStatus;
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      collectionStatus,
      invites: [invite, ...existing.invites],
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'invite_created',
          correlationId: invite.id.slice(0, 16),
          createdAt: now,
        }),
        ...existing.activity,
      ].slice(0, 200),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

/**
 * Prompt 06 / MV-072 — owner lock/open for contributor collection.
 * Uses domain `nextCollectionStatus`; guest redeem already denies LOCKED.
 */
export async function setTributeCollectionStatus(
  publicId: string,
  action: 'open' | 'lock',
): Promise<{ tribute: Tribute; collectionStatus: CollectionStatus } | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const collectionStatus = nextCollectionStatus(current.collectionStatus, action);
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      collectionStatus,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: action === 'lock' ? 'collection_locked' : 'collection_opened',
          correlationId: publicId.slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { tribute: next, collectionStatus };
}

export async function revokeContributorInvite(
  publicId: string,
  inviteId: string,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let found = false;
  const invites = existing.invites.map((invite) => {
    if (invite.id !== inviteId) {
      return invite;
    }
    found = true;
    return contributorInviteSchema.parse({ ...invite, revokedAt: now });
  });
  if (!found) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      invites,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

export async function findInviteByTokenHash(
  tokenHash: string,
): Promise<{ tribute: Tribute; invite: StoredContributorInvite } | null> {
  const store = await readStore();
  for (const tribute of Object.values(store.tributes)) {
    const migrated = migrateTribute(tribute as unknown as Record<string, unknown>);
    const invite = migrated.invites.find((row) => row.tokenHash === tokenHash);
    if (invite) {
      return { tribute: migrated, invite };
    }
  }
  return null;
}

export async function incrementInviteUse(
  publicId: string,
  inviteId: string,
): Promise<StoredContributorInvite | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  let updated: StoredContributorInvite | null = null;
  const invites = existing.invites.map((invite) => {
    if (invite.id !== inviteId) {
      return invite;
    }
    updated = contributorInviteSchema.parse({
      ...invite,
      useCount: invite.useCount + 1,
    });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      invites,
      updatedAt: new Date().toISOString(),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

export async function createGuestSession(input: {
  inviteId: string;
  tributePublicId: string;
  expiresAt: string;
}): Promise<GuestSession> {
  const store = await readStore();
  const now = new Date().toISOString();
  const session = guestSessionSchema.parse({
    sessionId: `gs_${crypto.randomUUID().replace(/-/g, '')}`,
    inviteId: input.inviteId,
    tributePublicId: input.tributePublicId,
    expiresAt: input.expiresAt,
    createdAt: now,
  });
  store.guestSessions[session.sessionId] = session;
  await writeStore(store);
  return session;
}

export async function getGuestSession(sessionId: string): Promise<GuestSession | null> {
  if (!sessionId || sessionId.length < 16) {
    return null;
  }
  const store = await readStore();
  const session = store.guestSessions[sessionId];
  if (!session) {
    return null;
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    return null;
  }
  return session;
}

export async function persistPrivateShare(
  publicId: string,
  share: StoredPrivateShare,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      shares: [share, ...existing.shares],
      updatedAt: new Date().toISOString(),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

export async function revokePrivateShare(
  publicId: string,
  shareId: string,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let found = false;
  const shares = existing.shares.map((share) => {
    if (share.id !== shareId) {
      return share;
    }
    found = true;
    return privateShareSchema.parse({ ...share, revokedAt: now });
  });
  if (!found) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      shares,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

export async function findShareByTokenHash(
  tokenHash: string,
): Promise<{ tribute: Tribute; share: StoredPrivateShare } | null> {
  const store = await readStore();
  for (const tribute of Object.values(store.tributes)) {
    const migrated = migrateTribute(tribute as unknown as Record<string, unknown>);
    const share = migrated.shares.find((row) => row.tokenHash === tokenHash);
    if (share) {
      return { tribute: migrated, share };
    }
  }
  return null;
}

export async function setMemoryReviewState(
  publicId: string,
  memoryId: string,
  reviewState: 'accepted' | 'declined',
): Promise<MemoryAsset | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let updated: MemoryAsset | null = null;
  const memories = existing.memories.map((memory) => {
    if (memory.id !== memoryId) {
      return memory;
    }
    updated = memoryAssetSchema.parse({
      ...memory,
      reviewState,
      updatedAt: now,
    });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      memories,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

export async function replaceRenderJobs(
  publicId: string,
  renderJobs: StoredRenderJob[],
  extras: Partial<Pick<Tribute, 'finalRendersUsed' | 'activity'>> = {},
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      ...extras,
      renderJobs,
      updatedAt: new Date().toISOString(),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

export async function updateCeremonyChecklist(
  publicId: string,
  patch: Partial<Pick<CeremonyChecklist, 'downloadDevice' | 'testVenue' | 'soundtrackCleared'>>,
): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      ceremonyChecklist: {
        ...existing.ceremonyChecklist,
        ...patch,
        updatedAt: now,
      },
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'checklist_updated',
          createdAt: now,
        }),
        ...existing.activity,
      ].slice(0, 200),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return next;
}

export async function addMember(
  publicId: string,
  input: { label: string; role: 'editor' | 'viewer' },
): Promise<StoredMember | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  const member = memberSchema.parse({
    id: `mbr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    label: input.label.trim().slice(0, 80),
    role: input.role,
    status: 'invited',
    createdAt: now,
    updatedAt: now,
  });
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      members: [member, ...existing.members],
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'member_added',
          correlationId: member.id.slice(0, 16),
          createdAt: now,
        }),
        ...existing.activity,
      ].slice(0, 200),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return member;
}

export async function revokeMember(publicId: string, memberId: string): Promise<StoredMember | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  let updated: StoredMember | null = null;
  const members = existing.members.map((member) => {
    if (member.id !== memberId || member.role === 'owner') {
      return member;
    }
    updated = memberSchema.parse({ ...member, status: 'revoked', updatedAt: now });
    return updated;
  });
  if (!updated) {
    return null;
  }
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      members,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return updated;
}

export function readyFinalRender(tribute: Tribute | null): StoredRenderJob | null {
  if (!tribute) return null;
  return (
    tribute.renderJobs.find((job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified) ??
    null
  );
}

/** Deterministic chapter suggestion from ready memories — never invents facts. */
export function deriveStoryChapters(tribute: Tribute): Tribute['storyChapters'] {
  const ready = tribute.memories.filter((m) => m.ingestStatus === 'READY' && m.reviewState !== 'declined');
  if (ready.length === 0) {
    return [];
  }
  const buckets = new Map<string, MemoryAsset[]>();
  for (const memory of ready) {
    const year = Number.parseInt(memory.year, 10);
    let key = 'unknown';
    if (Number.isFinite(year)) {
      if (year < 1970) key = 'early';
      else if (year < 1990) key = 'middle';
      else if (year < 2010) key = 'later';
      else key = 'recent';
    }
    const list = buckets.get(key) ?? [];
    list.push(memory);
    buckets.set(key, list);
  }
  const titles: Record<string, string> = {
    early: 'The early years',
    middle: 'Finding her people',
    later: 'A life full of love',
    recent: 'All the joy she gave',
    unknown: 'Moments without a date',
  };
  const order = ['early', 'middle', 'later', 'recent', 'unknown'];
  return order.flatMap((key, index) => {
    const memories = buckets.get(key);
    if (!memories?.length) return [];
    const years = memories.map((m) => m.year).filter(Boolean);
    return [
      {
        id: String(index + 1).padStart(2, '0'),
        title: titles[key] ?? key,
        yearHint: years[0] ?? '',
        memoryIds: memories.map((m) => m.id),
      },
    ];
  });
}

export async function ensureStoryChapters(publicId: string): Promise<Tribute | null> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) return null;
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  if (current.storyChapters.length > 0) {
    return current;
  }
  const chapters = deriveStoryChapters(current);
  return updateTribute(publicId, { storyChapters: chapters });
}

export async function requestLocalEnhancement(
  publicId: string,
  memoryId: string,
): Promise<
  | { ok: true; request: Tribute['enhancementRequests'][number] }
  | { ok: false; reason: 'not_found' | 'no_consent' | 'memory_not_found' }
> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) return { ok: false, reason: 'not_found' };
  if (!existing.enhancementConsentLocal) {
    return { ok: false, reason: 'no_consent' };
  }
  if (!existing.memories.some((m) => m.id === memoryId)) {
    return { ok: false, reason: 'memory_not_found' };
  }
  const now = new Date().toISOString();
  const request = {
    id: `enh_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    memoryId,
    status: 'queued' as const,
    note: 'Queued for local pixel ops only — generative enhancement is not available.',
    variantPath: null,
    approvedForFilm: false,
    createdAt: now,
    updatedAt: now,
  };
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      enhancementRequests: [request, ...existing.enhancementRequests].slice(0, 100),
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { ok: true, request };
}

/**
 * Advance one enhancement request. Local ffmpeg pixel-ops may produce ready_local.
 * Generative reconstruction stays unavailable and is never marked COMPLETE.
 */
export async function advanceEnhancementOnce(publicId: string): Promise<{
  advanced: Tribute['enhancementRequests'][number] | null;
  note: string;
}> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { advanced: null, note: 'not_found' };
  }
  const target = existing.enhancementRequests.find(
    (r) => r.status === 'queued' || r.status === 'processing',
  );
  if (!target) {
    return { advanced: null, note: 'idle' };
  }
  const now = new Date().toISOString();
  let nextStatus: Tribute['enhancementRequests'][number]['status'] = target.status;
  let note = '';
  let variantPath: string | null = target.variantPath ?? null;
  if (target.status === 'queued') {
    nextStatus = 'processing';
    note = 'processing_local';
  } else {
    const memory = existing.memories.find((m) => m.id === target.memoryId);
    if (!memory) {
      nextStatus = 'unavailable';
      note = 'memory_missing — original kept; generative reconstruction blocked (not COMPLETE)';
    } else {
      const { runLocalPixelOps } = await import('./pixel-ops');
      const ops = await runLocalPixelOps({
        sourceSrc: memory.imagePath,
        tributePublicId: publicId,
        requestId: target.id,
      });
      if (ops.ok) {
        nextStatus = 'ready_local';
        variantPath = ops.relativePath;
        note = 'local_pixel_ops_ready — contrast/brightness only; generative AI not COMPLETE';
      } else {
        nextStatus = 'unavailable';
        note = `local_pixel_ops_failed:${ops.reason} — original kept; generative reconstruction blocked (not COMPLETE)`;
      }
    }
  }
  const requests = existing.enhancementRequests.map((r) =>
    r.id === target.id
      ? {
          ...r,
          status: nextStatus,
          note,
          variantPath,
          updatedAt: now,
        }
      : r,
  );
  const next = migrateTribute(
    tributeSchema.parse({
      ...existing,
      enhancementRequests: requests,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  return { advanced: requests.find((r) => r.id === target.id) ?? null, note };
}

export type ApplyEnhancementToFilmResult =
  | {
      ok: true;
      tribute: Tribute;
      scenesUpdated: number;
      request: Tribute['enhancementRequests'][number];
      filmSrc: string;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'request_not_found'
        | 'not_ready'
        | 'no_timeline'
        | 'asset_not_in_timeline'
        | 'variant_missing';
    };

/**
 * Family-approved local enhancement → TimelineContract bind (Prompt 07 / MV-107 path).
 * Sets encode-safe `/api/enhancement/variant/{id}` src + enhancementVariantId.
 * Original memory bytes stay immutable. Generative Finish stays not COMPLETE.
 */
export async function applyEnhancementToFilm(
  publicId: string,
  requestId: string,
): Promise<ApplyEnhancementToFilmResult> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const request = current.enhancementRequests.find((r) => r.id === requestId);
  if (!request) {
    return { ok: false, reason: 'request_not_found' };
  }
  if (request.status !== 'ready_local' || !request.variantPath) {
    return { ok: false, reason: 'not_ready' };
  }
  const timeline = current.timeline as TimelineContract | null;
  if (!timeline) {
    return { ok: false, reason: 'no_timeline' };
  }

  const { enhancementVariantAbsolutePath, enhancementVariantPublicPath } = await import('./local-encode');
  const absolute = path.isAbsolute(request.variantPath)
    ? request.variantPath
    : path.join(process.cwd(), request.variantPath);
  const expected = enhancementVariantAbsolutePath(publicId, request.id);
  let variantBytesOk = false;
  try {
    await access(absolute);
    variantBytesOk = true;
  } catch {
    try {
      await access(expected);
      variantBytesOk = true;
    } catch {
      variantBytesOk = false;
    }
  }
  if (!variantBytesOk) {
    return { ok: false, reason: 'variant_missing' };
  }

  const filmSrc = enhancementVariantPublicPath(request.id);
  let scenesUpdated = 0;
  const nextScenes = timeline.scenes.map((scene) => {
    if (scene.type !== 'image' && scene.type !== 'video') {
      return scene;
    }
    if (scene.asset.assetId !== request.memoryId) {
      return scene;
    }
    scenesUpdated += 1;
    return {
      ...scene,
      asset: {
        ...scene.asset,
        src: filmSrc,
        enhancementVariantId: request.id,
      },
    };
  });
  if (scenesUpdated === 0) {
    return { ok: false, reason: 'asset_not_in_timeline' };
  }

  let nextTimeline: TimelineContract;
  try {
    nextTimeline = parseTimelineContract({
      ...timeline,
      scenes: nextScenes,
    });
  } catch {
    return { ok: false, reason: 'no_timeline' };
  }

  const now = new Date().toISOString();
  const note =
    'approved_for_film — local pixel-ops bound into TimelineContract; generative AI / Finish not COMPLETE';
  const requests = current.enhancementRequests.map((r) =>
    r.id === request.id
      ? {
          ...r,
          approvedForFilm: true,
          note,
          updatedAt: now,
        }
      : r,
  );
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      enhancementRequests: requests,
      timeline: nextTimeline,
      timelinePrevious: timeline,
      timelineVersion: current.timelineVersion + 1,
      updatedAt: now,
      activity: [
        activityEventSchema.parse({
          id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          code: 'enhancement_film_bound',
          correlationId: request.id.slice(0, 16),
          createdAt: now,
        }),
        ...current.activity,
      ].slice(0, 200),
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[publicId] = next;
  await writeStore(store);
  const bound = next.enhancementRequests.find((r) => r.id === request.id)!;
  return {
    ok: true,
    tribute: next,
    scenesUpdated,
    request: bound,
    filmSrc,
  };
}

export async function deleteTribute(publicId: string): Promise<boolean> {
  const store = await readStore();
  const existing = store.tributes[publicId];
  if (!existing || !actorAllowsTribute(existing.ownerAccountId)) {
    return false;
  }
  delete store.tributes[publicId];
  // Drop guest sessions bound to this tribute.
  for (const [sid, session] of Object.entries(store.guestSessions)) {
    if (session.tributePublicId === publicId) {
      delete store.guestSessions[sid];
    }
  }
  await writeStore(store);
  return true;
}

export async function listTributeSummaries(): Promise<
  Array<{
    publicId: string;
    displayName: string;
    updatedAt: string;
    locale: Tribute['locale'];
    firstFilmStage: Tribute['firstFilmStage'];
    memoryCount: number;
    entitlementActive: boolean;
    hasReadyFinal: boolean;
    readyJobId: string | null;
    hasPoster: boolean;
  }>
> {
  const all = await listTributes();
  return all.map((t) => {
    const ready = readyFinalRender(t);
    return {
      publicId: t.publicId,
      displayName: t.displayName,
      updatedAt: t.updatedAt,
      locale: t.locale,
      firstFilmStage: t.firstFilmStage,
      memoryCount: t.memories.length,
      entitlementActive: Boolean(t.entitlement),
      hasReadyFinal: Boolean(ready),
      readyJobId: ready?.id ?? null,
      hasPoster: Boolean(ready?.posterPath),
    };
  });
}

/**
 * Persist collab inbox fields (placement / decisions / tasks) with optional
 * timeline publish for family-confirmed placement apply/revert.
 */
export async function persistCollaborationState(input: {
  publicId: string;
  placementSuggestions?: StoredPlacementSuggestion[];
  collaborationDecisions?: StoredCollaborationDecision[];
  collaborationTasks?: StoredCollaborationTask[];
  timeline?: TimelineContract;
  activityCode?: ActivityEvent['code'];
  correlationId?: string;
}): Promise<{ ok: true; tribute: Tribute } | { ok: false; reason: 'not_found' }> {
  const store = await readStore();
  const existing = store.tributes[input.publicId];
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  const current = migrateTribute(existing as unknown as Record<string, unknown>);
  const now = new Date().toISOString();
  const activity =
    input.activityCode != null
      ? [
          activityEventSchema.parse({
            id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
            code: input.activityCode,
            correlationId: input.correlationId?.slice(0, 16),
            createdAt: now,
          }),
          ...current.activity,
        ].slice(0, 200)
      : current.activity;
  const next = migrateTribute(
    tributeSchema.parse({
      ...current,
      placementSuggestions: input.placementSuggestions ?? current.placementSuggestions,
      collaborationDecisions: input.collaborationDecisions ?? current.collaborationDecisions,
      collaborationTasks: input.collaborationTasks ?? current.collaborationTasks,
      ...(input.timeline
        ? {
            timeline: input.timeline,
            timelinePrevious: current.timeline,
            timelineVersion: current.timelineVersion + 1,
          }
        : {}),
      activity,
      updatedAt: now,
    }) as unknown as Record<string, unknown>,
  );
  store.tributes[input.publicId] = next;
  await writeStore(store);
  return { ok: true, tribute: next };
}

export type { InviteScope, ShareScope };
