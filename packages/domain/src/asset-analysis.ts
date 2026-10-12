import {
  ANALYSER_NAME,
  ANALYSER_VERSION,
  assetAnalysisSchema,
  ownerSafeAnalysisSchema,
  type AnalysisJobStatus,
  type AnalysisPipelineStatus,
  type AssetAnalysis,
  type DuplicateRef,
  type OwnerSafeAnalysis,
  type QualityObservation,
} from '@memorialvideo/contracts';

import { IllegalTransitionError } from './state-machine';

export const LOCAL_ANALYSER_PROVENANCE = {
  provider: 'local',
  model: ANALYSER_NAME,
  version: ANALYSER_VERSION,
} as const;

const JOB_TRANSITIONS: Record<AnalysisJobStatus, readonly AnalysisJobStatus[]> = {
  QUEUED: ['PREPARING'],
  PREPARING: ['READY', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
  READY: [],
  FAILED_RETRYABLE: ['PREPARING', 'FAILED_FINAL'],
  FAILED_FINAL: [],
};

export function canTransitionAnalysisJob(from: AnalysisJobStatus, to: AnalysisJobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function transitionAnalysisJob(from: AnalysisJobStatus, to: AnalysisJobStatus): AnalysisJobStatus {
  if (!canTransitionAnalysisJob(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

export function analysisIdempotencyKey(assetId: string, checksum: string): string {
  return `asset_analysis:${assetId}:${checksum}:${ANALYSER_VERSION}`;
}

export function canonicalizeDuplicatePair(left: string, right: string): [string, string] | null {
  if (!left || !right || left === right) {
    return null;
  }
  return left < right ? [left, right] : [right, left];
}

export function buildDuplicateRefs(input: {
  assetId: string;
  exactIds: readonly string[];
  likelyIds: ReadonlyArray<{ id: string; score: number }>;
  likelyThreshold: number;
}): DuplicateRef[] {
  const refs: DuplicateRef[] = [];
  for (const otherAssetId of input.exactIds) {
    if (otherAssetId === input.assetId) {
      continue;
    }
    refs.push({
      otherAssetId,
      kind: 'exact',
      method: 'sha256',
      score: 1,
      threshold: 1,
      reviewState: 'unreviewed',
    });
  }
  for (const near of input.likelyIds) {
    if (near.id === input.assetId) {
      continue;
    }
    refs.push({
      otherAssetId: near.id,
      kind: 'likely',
      method: 'average-hash',
      score: near.score,
      threshold: input.likelyThreshold,
      reviewState: 'unreviewed',
    });
  }
  return refs;
}

export type AnalysisJobCandidate = {
  id: string;
  status: AnalysisJobStatus;
  queuedAt: string;
};

export function normalizeAnalysisJobRow(row: {
  id: string;
  status: AnalysisJobStatus;
  queuedAt?: string;
  queued_at?: string;
}): AnalysisJobCandidate {
  return {
    id: row.id,
    status: row.status,
    queuedAt: row.queuedAt ?? row.queued_at ?? '',
  };
}

export function selectNextAnalysisJob(jobs: readonly AnalysisJobCandidate[]): string | null {
  const oldest = (status: AnalysisJobStatus) =>
    [...jobs]
      .filter((job) => job.status === status)
      .sort((left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt))[0]?.id ?? null;
  return oldest('QUEUED') ?? oldest('FAILED_RETRYABLE');
}

export function planAnalysisCompletion(input: {
  status: AnalysisJobStatus;
  inspectOk: boolean;
  partial: boolean;
  attemptCount: number;
}): {
  jobStatus: AnalysisJobStatus;
  pipelineStatus: AnalysisPipelineStatus;
  attemptCount: number;
  failAsset: false;
} {
  let status = input.status;
  if (status === 'QUEUED') {
    status = transitionAnalysisJob(status, 'PREPARING');
  }
  if (input.inspectOk) {
    return {
      jobStatus: transitionAnalysisJob(status, 'READY'),
      pipelineStatus: input.partial ? 'partial' : 'ready',
      attemptCount: input.attemptCount,
      failAsset: false,
    };
  }
  const attempts = input.attemptCount + 1;
  return {
    jobStatus: transitionAnalysisJob(status, attempts >= 3 ? 'FAILED_FINAL' : 'FAILED_RETRYABLE'),
    pipelineStatus: 'failed',
    attemptCount: attempts,
    failAsset: false,
  };
}

export function parseAssetAnalysis(input: unknown): AssetAnalysis {
  return assetAnalysisSchema.parse(input);
}

export function toOwnerSafeAnalysis(analysis: AssetAnalysis): OwnerSafeAnalysis {
  const media = analysis.media;
  return ownerSafeAnalysisSchema.parse({
    analysisId: analysis.analysisId,
    assetId: analysis.assetId,
    pipelineStatus: analysis.pipelineStatus,
    mediaKind: media.mediaKind,
    width: 'width' in media ? media.width : undefined,
    height: 'height' in media ? media.height : undefined,
    durationMs: 'durationMs' in media ? media.durationMs : undefined,
    hasAudio: media.mediaKind === 'video' ? media.hasAudio : undefined,
    qualityCodes: analysis.quality.map((item) => item.code),
    exactDuplicate: analysis.duplicates.some((item) => item.kind === 'exact'),
    likelyDuplicate: analysis.duplicates.some((item) => item.kind === 'likely'),
    capturedAtUnconfirmed: analysis.candidates.some(
      (item) => item.kind === 'captured_at' && item.status !== 'confirmed',
    ),
    capturedAtCandidate: analysis.candidates.find((item) => item.kind === 'captured_at')?.value,
    locationUnconfirmed: analysis.candidates.some(
      (item) => item.kind === 'location' && item.status !== 'confirmed',
    ),
    correctionState: analysis.correctionState,
  });
}

export function qualityCopyCodes(observations: readonly QualityObservation[]): string[] {
  return observations
    .filter((item) => item.severity !== 'information' || item.code === 'missing_audio')
    .map((item) => item.code);
}
