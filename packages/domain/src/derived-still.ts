import {
  type DerivedJobStatus,
  type PosterSource,
  type AiProvenance,
} from '@memorialvideo/contracts';

import { IllegalTransitionError } from './state-machine';

export const DERIVED_STILL_PROVIDER: AiProvenance = {
  provider: 'remotion',
  model: 'renderStill',
  version: '4.0.518',
};

export const EMBEDDED_STILL_PROVIDER: AiProvenance = {
  provider: 'local',
  model: 'embedded-poster',
  version: 'v1',
};

const DERIVED_TRANSITIONS: Record<DerivedJobStatus, readonly DerivedJobStatus[]> = {
  QUEUED: ['PREPARING'],
  PREPARING: ['READY', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
  READY: [],
  FAILED_RETRYABLE: ['PREPARING', 'FAILED_FINAL'],
  FAILED_FINAL: [],
};

export function canTransitionDerivedJob(from: DerivedJobStatus, to: DerivedJobStatus): boolean {
  return DERIVED_TRANSITIONS[from].includes(to);
}

export function transitionDerivedJob(from: DerivedJobStatus, to: DerivedJobStatus): DerivedJobStatus {
  if (!canTransitionDerivedJob(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

export function derivedStillIdempotencyKey(assetId: string): string {
  return `poster_still:${assetId}:v1`;
}

export function planIngestStill(input: {
  posterSource: PosterSource;
  hasEmbeddedFrame: boolean;
}): {
  attachNow: boolean;
  enqueueDerived: boolean;
  sourceMethod: PosterSource;
  provenance: AiProvenance | null;
} {
  if (input.posterSource === 'embedded_jpeg' || input.posterSource === 'mjpeg_sample') {
    return {
      attachNow: input.hasEmbeddedFrame,
      enqueueDerived: false,
      sourceMethod: input.posterSource,
      provenance: input.hasEmbeddedFrame ? EMBEDDED_STILL_PROVIDER : null,
    };
  }
  if (input.posterSource === 'h264_extract') {
    return {
      attachNow: false,
      enqueueDerived: true,
      sourceMethod: 'h264_extract',
      provenance: DERIVED_STILL_PROVIDER,
    };
  }
  return {
    attachNow: false,
    enqueueDerived: false,
    sourceMethod: 'unavailable',
    provenance: null,
  };
}

export type DerivedJobCandidate = {
  id: string;
  status: DerivedJobStatus;
  queuedAt: string;
};

export function selectNextDerivedJob(jobs: readonly DerivedJobCandidate[]): string | null {
  return (
    [...jobs]
      .filter((job) => job.status === 'QUEUED')
      .sort((left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt))[0]?.id ?? null
  );
}

export function planDerivedStillCompletion(input: {
  status: DerivedJobStatus;
  extractOk: boolean;
  attemptCount: number;
}): {
  status: DerivedJobStatus;
  attemptCount: number;
  attachPoster: boolean;
  failAsset: false;
} {
  let status = input.status;
  if (status === 'QUEUED') {
    status = transitionDerivedJob(status, 'PREPARING');
  }
  if (input.extractOk) {
    return {
      status: transitionDerivedJob(status, 'READY'),
      attemptCount: input.attemptCount,
      attachPoster: true,
      failAsset: false,
    };
  }
  const attempts = input.attemptCount + 1;
  return {
    status: transitionDerivedJob(status, attempts >= 3 ? 'FAILED_FINAL' : 'FAILED_RETRYABLE'),
    attemptCount: attempts,
    attachPoster: false,
    failAsset: false,
  };
}
