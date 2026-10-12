import {
  COLLABORATION_SUMMARY_ENGINE,
  collaborationDecisionSchema,
  collaborationFeedbackSummarySchema,
  collaborationInboxItemSchema,
  collaborationPlacementPatchPreviewSchema,
  collaborationPlacementSuggestionSchema,
  collaborationReviewTaskSchema,
  directorV2PatchSchema,
  IMAGE_DEFAULT_FRAMES,
  parseTimelineContract,
  type CollaborationDecision,
  type CollaborationDecisionOutcome,
  type CollaborationFeedbackSummary,
  type CollaborationInboxItem,
  type CollaborationPlacementPatchPreview,
  type CollaborationPlacementSuggestion,
  type CollaborationReviewTask,
  type CollaborationSubjectType,
  type DirectorLock,
  type DirectorV2Operation,
  type DirectorV2Patch,
  type TimelineContract,
  type TimelineScene,
} from '@memorialvideo/contracts';

import {
  applyDirectorOperations,
  hashTimeline,
  invertDirectorOperations,
  planDirectorApply,
  planDirectorRevert,
  previewDirectorPatch,
} from './director-v2';

export type CollaborationCommentSignal = {
  id: string;
  resolved: boolean;
  timecodeMs: number;
};

export type CollaborationConflictSignal = {
  id: string;
  state: string;
  familyDisagreement: boolean;
};

export type CollaborationDuplicateSignal = {
  pairId: string;
  reviewState: string;
};

export type CollaborationInboxInput = {
  comments: readonly CollaborationCommentSignal[];
  conflicts: readonly CollaborationConflictSignal[];
  duplicates: readonly CollaborationDuplicateSignal[];
  tasks: readonly CollaborationReviewTask[];
  activeFinalApproval: CollaborationDecision | null;
  placementSuggestions?: readonly CollaborationPlacementSuggestion[];
};

/** AI may flag; family must decide. Never auto-merge conflict facts. */
export function assertConflictNeverAutoResolved(conflict: CollaborationConflictSignal): boolean {
  if (conflict.familyDisagreement && conflict.state === 'resolved') {
    // Resolved is only valid after an explicit family resolution path — not silent.
    return true;
  }
  if (conflict.familyDisagreement && (conflict.state === 'open' || conflict.state === 'needs_input')) {
    return true;
  }
  return conflict.state !== 'auto_merged';
}

export function buildCollaborationInbox(input: CollaborationInboxInput): CollaborationInboxItem[] {
  const items: CollaborationInboxItem[] = [];

  for (const comment of input.comments) {
    if (comment.resolved) {
      continue;
    }
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'open_comment',
        id: `inbox_comment_${comment.id}`,
        subjectType: 'review_comment',
        subjectId: comment.id,
        labelKey: 'collab.inbox.openComment',
        detail: `t=${comment.timecodeMs}`,
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  for (const conflict of input.conflicts) {
    if (conflict.state === 'resolved' || conflict.state === 'dismissed' || conflict.state === 'preserved') {
      continue;
    }
    if (!assertConflictNeverAutoResolved(conflict)) {
      continue;
    }
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'open_conflict',
        id: `inbox_conflict_${conflict.id}`,
        subjectType: 'story_conflict',
        subjectId: conflict.id,
        labelKey: conflict.familyDisagreement
          ? 'collab.inbox.familyDisagreement'
          : 'collab.inbox.openConflict',
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  for (const duplicate of input.duplicates) {
    if (duplicate.reviewState !== 'unreviewed') {
      continue;
    }
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'unreviewed_duplicate',
        id: `inbox_dup_${duplicate.pairId}`,
        subjectType: 'duplicate_pair',
        subjectId: duplicate.pairId,
        labelKey: 'collab.inbox.unreviewedDuplicate',
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  for (const suggestion of input.placementSuggestions ?? []) {
    if (suggestion.status !== 'proposed') {
      continue;
    }
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'placement_suggestion',
        id: `inbox_place_${suggestion.id}`,
        subjectType: 'placement_suggestion',
        subjectId: suggestion.id,
        labelKey: 'collab.inbox.placementSuggestion',
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  for (const task of input.tasks) {
    if (task.status !== 'open') {
      continue;
    }
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'open_task',
        id: `inbox_task_${task.id}`,
        subjectType: task.subjectType,
        subjectId: task.subjectId,
        labelKey: task.labelKey,
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  if (input.activeFinalApproval) {
    items.push(
      collaborationInboxItemSchema.parse({
        kind: 'final_approval',
        id: `inbox_approval_${input.activeFinalApproval.id}`,
        subjectType: 'final_film',
        subjectId: input.activeFinalApproval.subjectId,
        labelKey: `collab.decision.${input.activeFinalApproval.outcome}`,
        detail: input.activeFinalApproval.outcome,
        familyMustDecide: true,
        aiMayNotDecide: true,
      }),
    );
  }

  return items;
}

export function summarizeFeedbackDeterministic(input: {
  summaryId: string;
  comments: readonly CollaborationCommentSignal[];
  conflicts: readonly CollaborationConflictSignal[];
  duplicates: readonly CollaborationDuplicateSignal[];
  tasks: readonly CollaborationReviewTask[];
  activeFinalApproval: CollaborationDecision | null;
}): CollaborationFeedbackSummary {
  const openCommentCount = input.comments.filter((c) => !c.resolved).length;
  const resolvedCommentCount = input.comments.filter((c) => c.resolved).length;
  const openConflicts = input.conflicts.filter(
    (c) => c.state !== 'resolved' && c.state !== 'dismissed' && c.state !== 'preserved',
  );
  const openConflictCount = openConflicts.length;
  const familyDisagreementCount = openConflicts.filter((c) => c.familyDisagreement).length;
  const unreviewedDuplicateCount = input.duplicates.filter((d) => d.reviewState === 'unreviewed').length;
  const openTaskCount = input.tasks.filter((t) => t.status === 'open').length;
  const hasOpenWork =
    openCommentCount + openConflictCount + unreviewedDuplicateCount + openTaskCount > 0;

  return collaborationFeedbackSummarySchema.parse({
    schemaVersion: 1,
    id: input.summaryId,
    engine: 'deterministic',
    generativeUnavailable: true,
    openCommentCount,
    resolvedCommentCount,
    openConflictCount,
    familyDisagreementCount,
    unreviewedDuplicateCount,
    openTaskCount,
    activeApprovalOutcome: input.activeFinalApproval?.outcome ?? null,
    labelledSummaryKey: hasOpenWork ? 'collab.summary.openWork' : 'collab.summary.clear',
    provenance: {
      provider: COLLABORATION_SUMMARY_ENGINE.provider,
      model: COLLABORATION_SUMMARY_ENGINE.model,
      version: COLLABORATION_SUMMARY_ENGINE.version,
    },
  });
}

export function planCollaborationDecision(input: {
  id: string;
  kind: CollaborationDecision['kind'];
  outcome: CollaborationDecisionOutcome;
  subjectType: CollaborationSubjectType;
  subjectId: string;
  summary: string;
  summaryKey?: string;
  relatedCommentId?: string;
  relatedConflictId?: string;
  relatedTaskId?: string;
  /** Must always be true — AI never decides family disagreement. */
  decidedByFamily: true;
}): { ok: true; decision: CollaborationDecision } | { ok: false; reason: 'ai_cannot_decide' } {
  if (input.decidedByFamily !== true) {
    return { ok: false, reason: 'ai_cannot_decide' };
  }
  if (input.kind === 'fact' && input.outcome === 'confirm' && !input.relatedConflictId && input.subjectType === 'story_conflict') {
    // Family may confirm a fact choice, but subject must be explicit — no silent winner id invented here.
  }
  const decision = collaborationDecisionSchema.parse({
    schemaVersion: 1,
    id: input.id,
    kind: input.kind,
    outcome: input.outcome,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    status: 'active',
    decidedByFamily: true,
    summary: input.summary.slice(0, 400),
    summaryKey: input.summaryKey,
    relatedCommentId: input.relatedCommentId,
    relatedConflictId: input.relatedConflictId,
    relatedTaskId: input.relatedTaskId,
    version: 0,
  });
  return { ok: true, decision };
}

export function planReviewTask(input: {
  id: string;
  kind: CollaborationReviewTask['kind'];
  subjectType: CollaborationSubjectType;
  subjectId: string;
  labelKey: string;
}): CollaborationReviewTask {
  return collaborationReviewTaskSchema.parse({
    schemaVersion: 1,
    id: input.id,
    kind: input.kind,
    status: 'open',
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    labelKey: input.labelKey,
    version: 0,
  });
}

export function completeReviewTask(
  task: CollaborationReviewTask,
  expectedVersion: number,
): { ok: true; task: CollaborationReviewTask } | { ok: false; reason: 'conflict' } {
  if (task.version !== expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  return {
    ok: true,
    task: collaborationReviewTaskSchema.parse({
      ...task,
      status: 'done',
      version: task.version + 1,
    }),
  };
}

/**
 * Propose only — never mutates TimelineContract. Family must confirm via CollaborationDecision.
 */
export function proposePlacementSuggestion(input: {
  id: string;
  assetId: string;
  suggestedChapterId?: string;
  suggestedSortHint?: number;
}): CollaborationPlacementSuggestion {
  return collaborationPlacementSuggestionSchema.parse({
    schemaVersion: 1,
    id: input.id,
    assetId: input.assetId,
    suggestedChapterId: input.suggestedChapterId,
    suggestedSortHint: input.suggestedSortHint,
    status: 'proposed',
    familyMustConfirm: true,
    changeTimeline: false,
    provenance: {
      provider: COLLABORATION_SUMMARY_ENGINE.provider,
      model: 'placement-hint-v1',
      version: COLLABORATION_SUMMARY_ENGINE.version,
    },
  });
}

export type PlacementAssetRef = {
  id: string;
  kind: 'image' | 'video';
  src: string;
  width?: number;
  height?: number;
  durationFrames?: number;
};

function sceneUsesAsset(scene: TimelineScene, assetId: string): boolean {
  if (scene.type !== 'image' && scene.type !== 'video') {
    return false;
  }
  return scene.asset.assetId === assetId;
}

function buildPlacementScene(asset: PlacementAssetRef): TimelineScene {
  const durationFrames = Math.max(
    IMAGE_DEFAULT_FRAMES,
    asset.durationFrames ?? IMAGE_DEFAULT_FRAMES,
  );
  if (asset.kind === 'video') {
    return {
      id: `video-${asset.id}`.slice(0, 80),
      type: 'video',
      durationFrames,
      transitionIn: 'dissolve',
      transitionOut: 'fade',
      asset: {
        assetId: asset.id,
        src: asset.src,
        width: asset.width,
        height: asset.height,
        durationFrames: asset.durationFrames,
      },
    };
  }
  return {
    id: `image-${asset.id}`.slice(0, 80),
    type: 'image',
    durationFrames,
    transitionIn: 'dissolve',
    transitionOut: 'fade',
    asset: {
      assetId: asset.id,
      src: asset.src,
      width: asset.width,
      height: asset.height,
    },
    crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
  };
}

function placementInsertIndex(
  before: TimelineContract,
  suggestion: CollaborationPlacementSuggestion,
): number {
  if (suggestion.suggestedChapterId) {
    const chapterIndex = before.scenes.findIndex(
      (scene) => scene.type === 'chapter' && scene.id === suggestion.suggestedChapterId,
    );
    if (chapterIndex >= 0) {
      let insertAt = chapterIndex + 1;
      while (
        insertAt < before.scenes.length &&
        before.scenes[insertAt]?.type !== 'chapter' &&
        before.scenes[insertAt]?.type !== 'outro'
      ) {
        insertAt += 1;
      }
      return insertAt;
    }
  }
  if (typeof suggestion.suggestedSortHint === 'number') {
    return Math.min(Math.max(0, suggestion.suggestedSortHint), before.scenes.length);
  }
  const outroAt = before.scenes.findIndex((scene) => scene.type === 'outro');
  return outroAt < 0 ? before.scenes.length : outroAt;
}

function lockBlocksPlacement(
  locks: readonly DirectorLock[],
  assetId: string,
): boolean {
  return locks.some(
    (lock) => lock.kind === 'never_include' && lock.targetId === assetId,
  );
}

/**
 * Compile a placement suggestion into an allowlisted TimelinePatch (insert_scene).
 * Preview/propose path — never mutates the live TimelineContract (`changeTimeline: false`).
 */
export function compilePlacementToPatch(input: {
  patchId: string;
  tributePublicId: string;
  suggestion: CollaborationPlacementSuggestion;
  asset: PlacementAssetRef;
  before: TimelineContract;
  timelineVersion: number;
  locks?: readonly DirectorLock[];
  idempotencyKey: string;
  createdAt: string;
}):
  | { ok: true; patch: DirectorV2Patch; preview: TimelineContract; changeTimeline: false }
  | { ok: false; reason: string; changeTimeline: false } {
  if (input.suggestion.status === 'dismissed') {
    return { ok: false, reason: 'dismissed', changeTimeline: false };
  }
  if (input.asset.id !== input.suggestion.assetId) {
    return { ok: false, reason: 'asset_mismatch', changeTimeline: false };
  }
  if (input.before.scenes.some((scene) => sceneUsesAsset(scene, input.asset.id))) {
    return { ok: false, reason: 'already_in_timeline', changeTimeline: false };
  }
  if (lockBlocksPlacement(input.locks ?? [], input.asset.id)) {
    return { ok: false, reason: 'manual_lock', changeTimeline: false };
  }

  const scene = buildPlacementScene(input.asset);
  const index = placementInsertIndex(input.before, input.suggestion);
  const operations: DirectorV2Operation[] = [{ op: 'insert_scene', index, scene }];

  try {
    const preview = parseTimelineContract(
      applyDirectorOperations(input.before, operations),
    );
    const inverse = invertDirectorOperations(input.before, operations);
    const restored = applyDirectorOperations(preview, inverse);
    if (hashTimeline(restored) !== hashTimeline(input.before)) {
      return { ok: false, reason: 'invalid_inverse', changeTimeline: false };
    }
    const patch = directorV2PatchSchema.parse({
      schemaVersion: 1,
      id: input.patchId,
      tributePublicId: input.tributePublicId,
      planId: `place_plan_${input.suggestion.id}`.slice(0, 80),
      briefId: `place_brief_${input.tributePublicId}`.slice(0, 80),
      baseTimelineVersion: input.timelineVersion,
      baseTimelineHash: hashTimeline(input.before),
      expectedTimelineHash: hashTimeline(preview),
      expectedDurationFrames: preview.scenes.reduce((sum, item) => sum + item.durationFrames, 0),
      operations,
      inverseOperations: inverse,
      preconditions: [
        { kind: 'timeline_hash', value: hashTimeline(input.before) },
        { kind: 'timeline_version', value: String(input.timelineVersion) },
      ],
      touchedSceneIds: [scene.id],
      touchedAssetIds: [input.asset.id],
      preservedLocks: input.locks ?? [],
      validationStatus: 'valid',
      previewStatus: 'ready',
      applyStatus: 'none',
      scope: 'full',
      idempotencyKey: input.idempotencyKey.slice(0, 160),
      provenance: {
        provider: COLLABORATION_SUMMARY_ENGINE.provider,
        model: 'placement-hint-v1',
        version: COLLABORATION_SUMMARY_ENGINE.version,
        kind: 'deterministic',
      },
      createdAt: input.createdAt,
      previewedAt: input.createdAt,
    });
    return { ok: true, patch, preview, changeTimeline: false };
  } catch {
    return { ok: false, reason: 'invalid_contract', changeTimeline: false };
  }
}

export function buildPlacementPatchPreview(input: {
  suggestionId: string;
  patch: DirectorV2Patch;
  before: TimelineContract;
  preview: TimelineContract;
}): CollaborationPlacementPatchPreview {
  return collaborationPlacementPatchPreviewSchema.parse({
    schemaVersion: 1,
    suggestionId: input.suggestionId,
    patchId: input.patch.id,
    beforeDurationFrames: input.before.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0),
    afterDurationFrames: input.preview.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0),
    touchedSceneIds: input.patch.touchedSceneIds,
    touchedAssetIds: input.patch.touchedAssetIds,
    familyMustConfirm: true,
    changeTimeline: false,
  });
}

/** Preview path — applies ops to a copy only. */
export function previewPlacementPatch(input: {
  current: TimelineContract;
  patch: DirectorV2Patch;
}): { ok: true; preview: TimelineContract; changeTimeline: false } | { ok: false; reason: string; changeTimeline: false } {
  const previewed = previewDirectorPatch(input);
  if (!previewed.ok) {
    return { ok: false, reason: previewed.reason, changeTimeline: false };
  }
  return { ok: true, preview: previewed.preview, changeTimeline: false };
}

export function planPlacementApply(input: {
  current: TimelineContract;
  currentVersion: number;
  patch: DirectorV2Patch;
  decidedByFamily: true;
}):
  | { ok: true; next: TimelineContract; action: 'apply' | 'noop'; changeTimeline: true }
  | { ok: false; reason: string; changeTimeline: false } {
  if (input.decidedByFamily !== true) {
    return { ok: false, reason: 'ai_cannot_decide', changeTimeline: false };
  }
  const planned = planDirectorApply(input);
  if (!planned.ok) {
    return { ok: false, reason: planned.reason, changeTimeline: false };
  }
  return { ok: true, next: planned.next, action: planned.action, changeTimeline: true };
}

export function planPlacementRevert(input: {
  current: TimelineContract;
  patch: DirectorV2Patch;
}):
  | { ok: true; next: TimelineContract; action: 'revert' | 'noop'; changeTimeline: true }
  | { ok: false; reason: string; changeTimeline: false } {
  const planned = planDirectorRevert(input);
  if (!planned.ok) {
    return { ok: false, reason: planned.reason, changeTimeline: false };
  }
  return { ok: true, next: planned.next, action: planned.action, changeTimeline: true };
}

export function markPlacementSuggestionStatus(
  suggestion: CollaborationPlacementSuggestion,
  status: 'confirmed' | 'dismissed',
): CollaborationPlacementSuggestion {
  return collaborationPlacementSuggestionSchema.parse({
    ...suggestion,
    status,
    familyMustConfirm: true,
    changeTimeline: false,
  });
}

export function deriveTasksFromSignals(input: {
  comments: readonly CollaborationCommentSignal[];
  conflicts: readonly CollaborationConflictSignal[];
  duplicates: readonly CollaborationDuplicateSignal[];
  placementSuggestions?: readonly CollaborationPlacementSuggestion[];
  existing: readonly CollaborationReviewTask[];
  idFactory: (kind: string, subjectId: string) => string;
}): CollaborationReviewTask[] {
  const existingKeys = new Set(
    input.existing
      .filter((t) => t.status === 'open')
      .map((t) => `${t.kind}:${t.subjectId}`),
  );
  const created: CollaborationReviewTask[] = [];

  for (const comment of input.comments.filter((c) => !c.resolved)) {
    const key = `resolve_comment:${comment.id}`;
    if (existingKeys.has(key)) {
      continue;
    }
    created.push(
      planReviewTask({
        id: input.idFactory('ct', comment.id),
        kind: 'resolve_comment',
        subjectType: 'review_comment',
        subjectId: comment.id,
        labelKey: 'collab.task.resolveComment',
      }),
    );
  }

  for (const conflict of input.conflicts.filter(
    (c) => c.state !== 'resolved' && c.state !== 'dismissed' && c.state !== 'preserved',
  )) {
    const key = `review_conflict:${conflict.id}`;
    if (existingKeys.has(key)) {
      continue;
    }
    created.push(
      planReviewTask({
        id: input.idFactory('ct', conflict.id),
        kind: 'review_conflict',
        subjectType: 'story_conflict',
        subjectId: conflict.id,
        labelKey: conflict.familyDisagreement
          ? 'collab.task.familyDisagreement'
          : 'collab.task.reviewConflict',
      }),
    );
  }

  for (const duplicate of input.duplicates.filter((d) => d.reviewState === 'unreviewed')) {
    const key = `review_duplicate:${duplicate.pairId}`;
    if (existingKeys.has(key)) {
      continue;
    }
    created.push(
      planReviewTask({
        id: input.idFactory('ct', duplicate.pairId),
        kind: 'review_duplicate',
        subjectType: 'duplicate_pair',
        subjectId: duplicate.pairId,
        labelKey: 'collab.task.reviewDuplicate',
      }),
    );
  }

  for (const suggestion of input.placementSuggestions ?? []) {
    if (suggestion.status !== 'proposed') {
      continue;
    }
    const key = `confirm_placement:${suggestion.id}`;
    if (existingKeys.has(key)) {
      continue;
    }
    created.push(
      planReviewTask({
        id: input.idFactory('ct', suggestion.id),
        kind: 'confirm_placement',
        subjectType: 'placement_suggestion',
        subjectId: suggestion.id,
        labelKey: 'collab.task.confirmPlacement',
      }),
    );
  }

  return created;
}

export function finalApprovalOutcomes(): readonly CollaborationDecisionOutcome[] {
  return ['approve', 'request_changes', 'defer'] as const;
}
