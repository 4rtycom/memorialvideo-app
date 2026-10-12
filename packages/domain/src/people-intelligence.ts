import {
  PEOPLE_ENGINE,
  faceObservationSchema,
  personClusterSchemaV2,
  sanitizePersonLabel,
  type FaceObservation,
  type PeopleConsent,
  type PeopleJobStatus,
  type PersonClusterV2,
  type PersonProfile,
} from '@memorialvideo/contracts';

export const MAX_PEOPLE_ATTEMPTS = 3;
export const PEOPLE_SIMILARITY_THRESHOLD = 0.55;
export const MAX_OBSERVATIONS_PER_ASSET = 40;
export const MAX_VIDEO_SAMPLE_FRAMES = 12;

/** Evenly spaced timestamps across the middle of a clip (skip open/close titles). */
export function planVideoSampleTimestamps(input: {
  durationMs: number;
  maxFrames?: number;
}): number[] {
  const durationMs = Math.max(0, Math.floor(input.durationMs));
  const byDuration = durationMs <= 0 ? 1 : Math.max(1, Math.floor(durationMs / 1000));
  const maxFrames = Math.max(
    1,
    Math.min(MAX_VIDEO_SAMPLE_FRAMES, input.maxFrames ?? MAX_VIDEO_SAMPLE_FRAMES, byDuration),
  );
  if (durationMs <= 0) {
    return [0];
  }
  if (durationMs < 1500) {
    return [Math.floor(durationMs / 2)];
  }
  const start = Math.floor(durationMs * 0.1);
  const end = Math.max(start + 1, Math.floor(durationMs * 0.9));
  const span = end - start;
  if (maxFrames === 1) {
    return [Math.floor(start + span / 2)];
  }
  const stamps: number[] = [];
  for (let index = 0; index < maxFrames; index += 1) {
    const t = start + Math.floor((span * index) / (maxFrames - 1));
    stamps.push(Math.min(durationMs - 1, Math.max(0, t)));
  }
  return [...new Set(stamps)].sort((a, b) => a - b);
}

export type PeopleJobRow = {
  id: string;
  projectId: string;
  assetId: string;
  status: PeopleJobStatus;
  idempotencyKey: string;
  attemptCount: number;
  queuedAt: string;
};

export function peopleProcessingAllowed(consent: PeopleConsent | null | undefined): boolean {
  if (!consent) {
    return false;
  }
  if (consent.state === 'revoked' || consent.state === 'disabled' || consent.state === 'pending_deletion') {
    return false;
  }
  return consent.localApproved === true || consent.externalApproved === true;
}

export function selectNextPeopleJob(rows: readonly PeopleJobRow[]): PeopleJobRow | null {
  const eligible = rows
    .filter((row) => row.status === 'QUEUED' || row.status === 'FAILED_RETRYABLE')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  return eligible[0] ?? null;
}

export function planPeopleClaim(row: PeopleJobRow):
  | { ok: true; nextStatus: 'PREPARING'; attemptCount: number }
  | { ok: false; reason: 'not_claimable' | 'retry_exhausted' } {
  if (row.status !== 'QUEUED' && row.status !== 'FAILED_RETRYABLE') {
    return { ok: false, reason: 'not_claimable' };
  }
  if (row.attemptCount >= MAX_PEOPLE_ATTEMPTS) {
    return { ok: false, reason: 'retry_exhausted' };
  }
  return { ok: true, nextStatus: 'PREPARING', attemptCount: row.attemptCount + 1 };
}

export function cosineSimilarity(left: Float32Array | number[], right: Float32Array | number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function clusterObservationsBySimilarity(input: {
  tributePublicId: string;
  items: Array<{ observation: FaceObservation; embedding: Float32Array | number[] }>;
  threshold?: number;
  createdAt: string;
}): PersonClusterV2[] {
  const threshold = input.threshold ?? PEOPLE_SIMILARITY_THRESHOLD;
  const scopedItems = input.items.filter(
    (item) => item.observation.tributePublicId === input.tributePublicId,
  );
  const assigned = new Set<string>();
  const clusters: PersonClusterV2[] = [];
  for (let index = 0; index < scopedItems.length; index += 1) {
    const seed = scopedItems[index]!;
    if (assigned.has(seed.observation.id)) {
      continue;
    }
    const members = [seed];
    assigned.add(seed.observation.id);
    for (let otherIndex = index + 1; otherIndex < scopedItems.length; otherIndex += 1) {
      const candidate = scopedItems[otherIndex]!;
      if (assigned.has(candidate.observation.id)) {
        continue;
      }
      const score = cosineSimilarity(seed.embedding, candidate.embedding);
      if (score >= threshold) {
        members.push(candidate);
        assigned.add(candidate.observation.id);
      }
    }
    const memberIds = members.map((item) => item.observation.id);
    const best = members.reduce((current, item) =>
      item.observation.detectionConfidence > current.observation.detectionConfidence ? item : current,
    );
    clusters.push(
      personClusterSchemaV2.parse({
        schemaVersion: 1,
        id: `pc_${seed.observation.id.slice(-12)}`,
        tributePublicId: input.tributePublicId,
        memberObservationIds: memberIds,
        method: PEOPLE_ENGINE.clustering,
        methodVersion: PEOPLE_ENGINE.version,
        similarityThresholdVersion: `cosine_${threshold}`,
        reviewState: 'unreviewed',
        representativeObservationId: best.observation.id,
        provenance: {
          provider: PEOPLE_ENGINE.name,
          model: PEOPLE_ENGINE.representation,
          version: PEOPLE_ENGINE.version,
        },
        createdAt: input.createdAt,
      }),
    );
  }
  return clusters;
}

export function planClusterSplit(input: {
  cluster: PersonClusterV2;
  keepObservationIds: readonly string[];
  moveObservationIds: readonly string[];
  expectedVersion: number;
  createdAt: string;
}):
  | { ok: true; kept: PersonClusterV2; moved: PersonClusterV2 }
  | { ok: false; reason: 'conflict' | 'empty' } {
  if (input.cluster.version !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  const keep = input.keepObservationIds.filter((id) => input.cluster.memberObservationIds.includes(id));
  const move = input.moveObservationIds.filter((id) => input.cluster.memberObservationIds.includes(id));
  if (keep.length === 0 || move.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  const kept = personClusterSchemaV2.parse({
    ...input.cluster,
    memberObservationIds: keep,
    representativeObservationId: keep[0],
    reviewState: 'needs_split',
    version: input.cluster.version + 1,
    updatedAt: input.createdAt,
  });
  const moved = personClusterSchemaV2.parse({
    schemaVersion: 1,
    id: `pc_split_${move[0]!.slice(-10)}`,
    tributePublicId: input.cluster.tributePublicId,
    memberObservationIds: move,
    method: input.cluster.method,
    methodVersion: input.cluster.methodVersion,
    similarityThresholdVersion: input.cluster.similarityThresholdVersion,
    reviewState: 'unreviewed',
    representativeObservationId: move[0],
    provenance: input.cluster.provenance,
    createdAt: input.createdAt,
    supersededClusterId: input.cluster.id,
  });
  return { ok: true, kept, moved };
}

export function planClusterMerge(input: {
  left: PersonClusterV2;
  right: PersonClusterV2;
  expectedLeftVersion: number;
  expectedRightVersion: number;
  createdAt: string;
}):
  | { ok: true; merged: PersonClusterV2; supersededIds: string[] }
  | { ok: false; reason: 'conflict' | 'cross_tribute' } {
  if (input.left.tributePublicId !== input.right.tributePublicId) {
    return { ok: false, reason: 'cross_tribute' };
  }
  if (input.left.version !== input.expectedLeftVersion || input.right.version !== input.expectedRightVersion) {
    return { ok: false, reason: 'conflict' };
  }
  const memberObservationIds = [...new Set([...input.left.memberObservationIds, ...input.right.memberObservationIds])];
  const merged = personClusterSchemaV2.parse({
    schemaVersion: 1,
    id: `pc_merge_${input.left.id.slice(-8)}`,
    tributePublicId: input.left.tributePublicId,
    memberObservationIds,
    method: input.left.method,
    methodVersion: input.left.methodVersion,
    similarityThresholdVersion: input.left.similarityThresholdVersion,
    reviewState: 'unreviewed',
    representativeObservationId: input.left.representativeObservationId,
    provenance: input.left.provenance,
    createdAt: input.createdAt,
  });
  return { ok: true, merged, supersededIds: [input.left.id, input.right.id] };
}

export function buildPersonProfileFromCluster(input: {
  id: string;
  tributePublicId: string;
  cluster: PersonClusterV2;
  displayLabel: string;
  createdAt: string;
  userId?: string;
}): PersonProfile {
  return {
    schemaVersion: 1,
    id: input.id,
    tributePublicId: input.tributePublicId,
    displayLabel: sanitizePersonLabel(input.displayLabel) || 'Unknown guest',
    linkedClusterIds: [input.cluster.id],
    linkedObservationIds: [...input.cluster.memberObservationIds],
    privacyState: 'private',
    approvedForStory: false,
    approvedForFilm: false,
    version: 0,
    updatedByUserId: input.userId,
    createdAt: input.createdAt,
    changeTimeline: false,
  };
}

export function observationForAsset(input: {
  id: string;
  tributePublicId: string;
  assetId: string;
  bbox: FaceObservation['bbox'];
  confidence: number;
  frameTimestampMs?: number;
  qualityCodes?: string[];
  createdAt: string;
}): FaceObservation {
  return faceObservationSchema.parse({
    schemaVersion: 1,
    id: input.id,
    tributePublicId: input.tributePublicId,
    assetId: input.assetId,
    frameTimestampMs: input.frameTimestampMs,
    bbox: input.bbox,
    detectionConfidence: Math.min(1, Math.max(0, input.confidence)),
    qualityCodes: input.qualityCodes ?? [],
    detectorName: PEOPLE_ENGINE.detector,
    detectorVersion: PEOPLE_ENGINE.version,
    provenance: {
      provider: PEOPLE_ENGINE.name,
      model: PEOPLE_ENGINE.detector,
      version: PEOPLE_ENGINE.version,
    },
    pipelineStatus: 'ready',
    reviewState: 'unreviewed',
    exclusionState: 'none',
    createdAt: input.createdAt,
  });
}
