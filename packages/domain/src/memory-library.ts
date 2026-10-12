import {
  duplicateDecisionSchema,
  memoryContextSchema,
  type DuplicateDecision,
  type DuplicateDecisionKind,
  type LibraryFilter,
  type LibrarySort,
  type MemoryContext,
  type OwnerSafeAnalysis,
} from '@memorialvideo/contracts';

import { canonicalizeDuplicatePair } from './asset-analysis';

export const emptyMemoryContext = (assetId: string): MemoryContext =>
  memoryContextSchema.parse({
    schemaVersion: 1,
    assetId,
  });

export function parseMemoryContext(input: unknown): MemoryContext {
  return memoryContextSchema.parse(input);
}

export function parseDuplicateDecision(input: unknown): DuplicateDecision {
  return duplicateDecisionSchema.parse(input);
}

export function contextWithoutPrivateNote(context: MemoryContext): Omit<MemoryContext, 'privateNote'> & { privateNote?: undefined } {
  const { privateNote: _note, ...safe } = context;
  return safe;
}

export function confirmDateFromCandidate(input: {
  context: MemoryContext;
  candidate?: string;
}): MemoryContext {
  if (!input.candidate) {
    return input.context;
  }
  return {
    ...input.context,
    dateValue: input.candidate.slice(0, 10),
    datePrecision: 'exact',
    dateProvenance: 'family_confirmed',
    reviewState: input.context.reviewState === 'unreviewed' ? 'confirmed' : input.context.reviewState,
  };
}

export function planMemoryContextSave(input: {
  existing: MemoryContext | null;
  next: MemoryContext;
  expectedVersion: number;
}): { ok: true; context: MemoryContext; noop: boolean } | { ok: false; reason: 'conflict' } {
  const currentVersion = input.existing?.version ?? 0;
  if (currentVersion !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  if (input.existing && contextEquals(input.existing, input.next)) {
    return { ok: true, context: input.existing, noop: true };
  }
  return {
    ok: true,
    noop: false,
    context: {
      ...input.next,
      schemaVersion: 1,
      version: currentVersion + 1,
    },
  };
}

export function planDuplicateDecisionSave(input: {
  assetId: string;
  otherAssetId: string;
  kind: 'exact' | 'likely';
  decision: DuplicateDecisionKind;
  expectedVersion: number;
  existing: DuplicateDecision | null;
}): { ok: true; decision: DuplicateDecision; noop: boolean; hideAsset: false; changeTimeline: false } | { ok: false; reason: 'conflict' | 'self_pair' } {
  const pair = canonicalizeDuplicatePair(input.assetId, input.otherAssetId);
  if (!pair) {
    return { ok: false, reason: 'self_pair' };
  }
  const currentVersion = input.existing?.version ?? 0;
  if (currentVersion !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  const next = duplicateDecisionSchema.parse({
    schemaVersion: 1,
    assetIdLow: pair[0],
    assetIdHigh: pair[1],
    kind: input.kind,
    decision: input.decision,
    version: currentVersion + 1,
  });
  if (
    input.existing &&
    input.existing.decision === next.decision &&
    input.existing.kind === next.kind
  ) {
    return { ok: true, decision: input.existing, noop: true, hideAsset: false, changeTimeline: false };
  }
  return { ok: true, decision: next, noop: false, hideAsset: false, changeTimeline: false };
}

export type LibraryListItem = {
  assetId: string;
  createdAt: string;
  mediaKind: 'photo' | 'video' | 'audio' | 'unsupported';
  /** Durable ingest status from `assets.status` (not analysis pipeline). */
  ingestStatus?: string;
  usedInTribute: boolean;
  analysis: OwnerSafeAnalysis;
  context: MemoryContext;
  decisions: Array<{ otherAssetId: string; kind: 'exact' | 'likely'; decision: DuplicateDecisionKind; version: number }>;
};

export function memoryNeedsReview(item: LibraryListItem): boolean {
  const analysing = item.analysis.pipelineStatus === 'queued' || item.analysis.pipelineStatus === 'processing';
  if (analysing) {
    return false;
  }
  const openDuplicate = (item.analysis.exactDuplicate || item.analysis.likelyDuplicate) &&
    !item.decisions.some((decision) => decision.decision !== 'unsure');
  return (
    item.context.reviewState === 'unreviewed' ||
    (item.context.qualityReview === 'unreviewed' && item.analysis.qualityCodes.length > 0) ||
    openDuplicate
  );
}

export function filterLibraryItems(items: readonly LibraryListItem[], filter: LibraryFilter): LibraryListItem[] {
  return items.filter((item) => {
    switch (filter) {
      case 'all':
        return true;
      case 'needs_review':
        return memoryNeedsReview(item);
      case 'photos':
        return item.mediaKind === 'photo';
      case 'videos':
        return item.mediaKind === 'video';
      case 'audio':
        return item.mediaKind === 'audio';
      case 'analysing':
        return item.analysis.pipelineStatus === 'queued' || item.analysis.pipelineStatus === 'processing';
      case 'processing':
        return Boolean(item.ingestStatus) && item.ingestStatus !== 'READY' && item.ingestStatus !== 'DELETED';
      case 'quality':
        return item.analysis.qualityCodes.length > 0;
      case 'exact':
        return item.analysis.exactDuplicate;
      case 'possible':
        return item.analysis.likelyDuplicate;
      case 'used':
        return item.usedInTribute;
      case 'unused':
        return !item.usedInTribute;
      default:
        return true;
    }
  });
}

export function sortLibraryItems(items: readonly LibraryListItem[], sort: LibrarySort): LibraryListItem[] {
  return [...items].sort((left, right) => {
    if (sort === 'type') {
      return left.mediaKind.localeCompare(right.mediaKind) || right.createdAt.localeCompare(left.createdAt);
    }
    if (sort === 'review') {
      return Number(memoryNeedsReview(right)) - Number(memoryNeedsReview(left)) || right.createdAt.localeCompare(left.createdAt);
    }
    if (sort === 'date') {
      const leftDate = left.context.dateValue || left.analysis.capturedAtCandidate || '';
      const rightDate = right.context.dateValue || right.analysis.capturedAtCandidate || '';
      return rightDate.localeCompare(leftDate) || right.createdAt.localeCompare(left.createdAt);
    }
    return right.createdAt.localeCompare(left.createdAt) || left.assetId.localeCompare(right.assetId);
  });
}

export function searchLibraryItems(items: readonly LibraryListItem[], query: string): LibraryListItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...items];
  }
  return items.filter((item) => {
    const haystack = [
      item.context.familyTitle,
      item.context.caption,
      item.context.locationLabel,
      item.context.occasionLabel,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function paginateLibraryItems<T>(items: readonly T[], offset: number, limit: number): { items: T[]; total: number; offset: number } {
  const safeLimit = Math.min(48, Math.max(1, limit));
  const safeOffset = Math.max(0, offset);
  return {
    items: items.slice(safeOffset, safeOffset + safeLimit),
    total: items.length,
    offset: safeOffset,
  };
}

function contextEquals(left: MemoryContext, right: MemoryContext): boolean {
  return (
    left.familyTitle === right.familyTitle &&
    left.caption === right.caption &&
    left.dateValue === right.dateValue &&
    left.dateEnd === right.dateEnd &&
    left.datePrecision === right.datePrecision &&
    left.dateProvenance === right.dateProvenance &&
    left.locationLabel === right.locationLabel &&
    left.occasionLabel === right.occasionLabel &&
    left.privateNote === right.privateNote &&
    left.importance === right.importance &&
    left.qualityReview === right.qualityReview &&
    left.reviewState === right.reviewState
  );
}
