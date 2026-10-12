import {
  collaborationDecisionSchema,
  collaborationPlacementSuggestionSchema,
  collaborationReviewTaskSchema,
  directorV2PatchSchema,
  parseTimelineContract,
  type CollaborationDecision,
  type CollaborationDecisionOutcome,
  type CollaborationFeedbackSummary,
  type CollaborationInboxItem,
  type CollaborationPlacementPatchPreview,
  type CollaborationPlacementSuggestion,
  type CollaborationReviewTask,
  type CollaborationSubjectType,
  type DirectorV2Patch,
  type TimelineContract,
} from '@memorialvideo/contracts';
import {
  buildCollaborationInbox,
  buildPlacementPatchPreview,
  compilePlacementToPatch,
  deriveTasksFromSignals,
  finalApprovalOutcomes,
  markPlacementSuggestionStatus,
  planCollaborationDecision,
  planPlacementApply,
  planPlacementRevert,
  proposePlacementSuggestion,
  summarizeFeedbackDeterministic,
} from '@memorialvideo/domain';
import {
  getTribute,
  persistCollaborationState,
  type StoredCollaborationDecision,
  type StoredCollaborationTask,
  type StoredPlacementSuggestion,
  type Tribute,
} from './store';

function newPublicId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

type FilmPatchState = {
  patch: DirectorV2Patch;
  beforeSnapshot: TimelineContract;
  afterSnapshot: TimelineContract;
  applyStatus: 'none' | 'applied' | 'reverted';
};

function toDomainSuggestion(row: StoredPlacementSuggestion): CollaborationPlacementSuggestion {
  return collaborationPlacementSuggestionSchema.parse({
    schemaVersion: 1,
    id: row.id,
    assetId: row.assetId,
    suggestedChapterId: row.suggestedChapterId,
    suggestedSortHint: row.suggestedSortHint,
    status: row.status,
    familyMustConfirm: true,
    changeTimeline: false,
    provenance: row.provenance,
  });
}

function toDomainTask(row: StoredCollaborationTask): CollaborationReviewTask {
  return collaborationReviewTaskSchema.parse({
    schemaVersion: 1,
    id: row.id,
    kind: row.kind,
    status: row.status,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    labelKey: row.labelKey,
    version: row.version,
  });
}

function toDomainDecision(row: StoredCollaborationDecision): CollaborationDecision {
  return collaborationDecisionSchema.parse({
    schemaVersion: 1,
    id: row.id,
    kind: row.kind,
    outcome: row.outcome,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    status: row.status,
    decidedByFamily: true,
    summary: row.summary,
    summaryKey: row.summaryKey,
    relatedCommentId: row.relatedCommentId,
    relatedConflictId: row.relatedConflictId,
    relatedTaskId: row.relatedTaskId,
    version: row.version,
  });
}

function readFilmPatch(row: StoredPlacementSuggestion): FilmPatchState | null {
  if (!row.filmPatch) {
    return null;
  }
  try {
    return {
      patch: directorV2PatchSchema.parse(row.filmPatch.patch),
      beforeSnapshot: parseTimelineContract(row.filmPatch.beforeSnapshot),
      afterSnapshot: parseTimelineContract(row.filmPatch.afterSnapshot),
      applyStatus: row.filmPatch.applyStatus,
    };
  } catch {
    return null;
  }
}

function currentTimeline(tribute: Tribute): TimelineContract | null {
  if (!tribute.timeline) {
    return null;
  }
  try {
    return parseTimelineContract(tribute.timeline);
  } catch {
    try {
      return parseTimelineContract({
        ...(tribute.timeline as object),
        displayName: tribute.displayName,
      });
    } catch {
      return null;
    }
  }
}

function ensureDerivedTasks(tribute: Tribute): StoredCollaborationTask[] {
  const placements = tribute.placementSuggestions.map(toDomainSuggestion);
  const existing = tribute.collaborationTasks.map(toDomainTask);
  const derived = deriveTasksFromSignals({
    comments: [],
    conflicts: [],
    duplicates: [],
    placementSuggestions: placements,
    existing,
    idFactory: (kind, subjectId) => newPublicId(`${kind}_${subjectId.slice(0, 8)}`),
  });
  if (derived.length === 0) {
    return tribute.collaborationTasks;
  }
  const now = new Date().toISOString();
  const added: StoredCollaborationTask[] = derived.map((task) => ({
    schemaVersion: 1 as const,
    id: task.id,
    kind: task.kind,
    status: task.status,
    subjectType: task.subjectType,
    subjectId: task.subjectId,
    labelKey: task.labelKey,
    version: task.version,
    createdAt: now,
    completedAt: null,
  }));
  return [...tribute.collaborationTasks, ...added].slice(0, 100);
}

export type CollaborationOverview = {
  inbox: CollaborationInboxItem[];
  summary: CollaborationFeedbackSummary;
  decisions: CollaborationDecision[];
  tasks: CollaborationReviewTask[];
  placementSuggestions: CollaborationPlacementSuggestion[];
  placementPatchStates: Array<{
    suggestionId: string;
    status: CollaborationPlacementSuggestion['status'];
    applyStatus: 'none' | 'applied' | 'reverted';
  }>;
  activeFinalApproval: CollaborationDecision | null;
  finalApprovalOutcomes: readonly CollaborationDecisionOutcome[];
  changeTimeline: false;
  note: string;
};

function buildOverview(tribute: Tribute): CollaborationOverview {
  const tasksStored = ensureDerivedTasks(tribute);
  const tasks = tasksStored.map(toDomainTask);
  const decisions = tribute.collaborationDecisions.map(toDomainDecision);
  const placementSuggestions = tribute.placementSuggestions.map(toDomainSuggestion);
  const placementPatchStates = tribute.placementSuggestions.map((row) => ({
    suggestionId: row.id,
    status: row.status,
    applyStatus: readFilmPatch(row)?.applyStatus ?? ('none' as const),
  }));
  const activeFinalApproval =
    decisions.find(
      (d) => d.status === 'active' && d.kind === 'approval' && d.subjectType === 'final_film',
    ) ?? null;
  const inbox = buildCollaborationInbox({
    comments: [],
    conflicts: [],
    duplicates: [],
    tasks,
    activeFinalApproval,
    placementSuggestions,
  });
  const summary = summarizeFeedbackDeterministic({
    summaryId: newPublicId('cfs'),
    comments: [],
    conflicts: [],
    duplicates: [],
    tasks,
    activeFinalApproval,
  });
  return {
    inbox,
    summary,
    decisions,
    tasks,
    placementSuggestions,
    placementPatchStates,
    activeFinalApproval,
    finalApprovalOutcomes: finalApprovalOutcomes(),
    changeTimeline: false,
    note: 'Deterministic collab inbox. Generative family-feedback summary is not configured (0). AI never decides.',
  };
}

export async function loadOwnerCollaboration(
  publicId: string,
): Promise<CollaborationOverview | { error: string; status: number }> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const tasks = ensureDerivedTasks(tribute);
  if (tasks.length !== tribute.collaborationTasks.length) {
    await persistCollaborationState({
      publicId,
      collaborationTasks: tasks,
    });
    const refreshed = await getTribute(publicId);
    if (!refreshed) {
      return { error: 'not_found', status: 404 };
    }
    return buildOverview(refreshed);
  }
  return buildOverview(tribute);
}

/**
 * Propose-only placement after a contributor upload. Never mutates TimelineContract.
 */
export async function proposePlacementForContributorAsset(input: {
  publicId: string;
  assetId: string;
}): Promise<{ ok: true; suggestionId: string } | { ok: false; reason: string }> {
  const tribute = await getTribute(input.publicId);
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  const existing = tribute.placementSuggestions.find(
    (row) => row.assetId === input.assetId && row.status === 'proposed',
  );
  if (existing) {
    return { ok: true, suggestionId: existing.id };
  }
  const memory = tribute.memories.find((m) => m.id === input.assetId);
  if (!memory || memory.source !== 'contributor') {
    return { ok: false, reason: 'not_contributor' };
  }
  const suggestion = proposePlacementSuggestion({
    id: newPublicId('cps'),
    assetId: input.assetId,
  });
  const now = new Date().toISOString();
  const stored: StoredPlacementSuggestion = {
    id: suggestion.id,
    assetId: suggestion.assetId,
    suggestedChapterId: suggestion.suggestedChapterId,
    suggestedSortHint: suggestion.suggestedSortHint,
    status: 'proposed',
    familyMustConfirm: true,
    changeTimeline: false,
    provenance: suggestion.provenance,
    filmPatch: null,
    createdAt: now,
    updatedAt: now,
  };
  const task: StoredCollaborationTask = {
    schemaVersion: 1,
    id: newPublicId('ct'),
    kind: 'confirm_placement',
    status: 'open',
    subjectType: 'placement_suggestion',
    subjectId: suggestion.id,
    labelKey: 'collab.task.confirmPlacement',
    version: 0,
    createdAt: now,
    completedAt: null,
  };
  const saved = await persistCollaborationState({
    publicId: input.publicId,
    placementSuggestions: [...tribute.placementSuggestions, stored].slice(0, 100),
    collaborationTasks: [...tribute.collaborationTasks, task].slice(0, 100),
    activityCode: 'placement_proposed',
    correlationId: suggestion.id,
  });
  if (!saved.ok) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true, suggestionId: suggestion.id };
}

function loadAssetRef(
  tribute: Tribute,
  assetId: string,
):
  | { id: string; kind: 'image' | 'video'; src: string; width?: number; height?: number }
  | { error: string; status: number } {
  const memory = tribute.memories.find((m) => m.id === assetId);
  if (!memory) {
    return { error: 'not_found', status: 404 };
  }
  const kind =
    memory.originalFilenameHint?.match(/\.(mp4|mov|webm)$/i) ||
    memory.imagePath.match(/\.(mp4|mov|webm)$/i)
      ? 'video'
      : 'image';
  return {
    id: memory.id,
    kind,
    src: memory.imagePath,
  };
}

export async function previewOwnerPlacementPatch(
  publicId: string,
  body: { suggestionId: string },
): Promise<
  (CollaborationPlacementPatchPreview & { applyStatus: 'none' }) | { error: string; status: number }
> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const row = tribute.placementSuggestions.find((s) => s.id === body.suggestionId);
  if (!row) {
    return { error: 'not_found', status: 404 };
  }
  const parsed = toDomainSuggestion(row);
  if (parsed.status === 'dismissed') {
    return { error: 'dismissed', status: 409 };
  }
  const timeline = currentTimeline(tribute);
  if (!timeline) {
    return { error: 'needs_timeline', status: 409 };
  }
  const asset = loadAssetRef(tribute, parsed.assetId);
  if ('error' in asset) {
    return asset;
  }
  const compiled = compilePlacementToPatch({
    patchId: newPublicId('cpt'),
    tributePublicId: tribute.publicId,
    suggestion: parsed,
    asset,
    before: timeline,
    timelineVersion: tribute.timelineVersion,
    idempotencyKey: `placement:${parsed.id}:${tribute.timelineVersion}`,
    createdAt: new Date().toISOString(),
  });
  if (!compiled.ok) {
    return { error: compiled.reason, status: 409 };
  }
  const now = new Date().toISOString();
  const nextRows = tribute.placementSuggestions.map((item) =>
    item.id === row.id
      ? {
          ...item,
          filmPatch: {
            patch: compiled.patch,
            beforeSnapshot: timeline,
            afterSnapshot: compiled.preview,
            applyStatus: 'none' as const,
          },
          updatedAt: now,
        }
      : item,
  );
  await persistCollaborationState({
    publicId,
    placementSuggestions: nextRows,
  });
  return {
    ...buildPlacementPatchPreview({
      suggestionId: parsed.id,
      patch: compiled.patch,
      before: timeline,
      preview: compiled.preview,
    }),
    applyStatus: 'none',
  };
}

export async function applyOwnerPlacementPatch(
  publicId: string,
  body: { suggestionId: string },
): Promise<
  | {
      ok: true;
      patchId: string;
      applyStatus: 'applied';
      changeTimeline: true;
      decidedByFamily: true;
      overview: CollaborationOverview;
    }
  | { error: string; status: number }
> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const row = tribute.placementSuggestions.find((s) => s.id === body.suggestionId);
  if (!row) {
    return { error: 'not_found', status: 404 };
  }
  const parsed = toDomainSuggestion(row);
  if (parsed.status === 'dismissed') {
    return { error: 'dismissed', status: 409 };
  }
  const timeline = currentTimeline(tribute);
  if (!timeline) {
    return { error: 'needs_timeline', status: 409 };
  }

  // Always recompile against the live TimelineContract so apply does not depend on
  // JSON-round-tripped patch ops (local store). Family decision is still required.
  const priorFilm = readFilmPatch(row);
  const asset = loadAssetRef(tribute, parsed.assetId);
  if ('error' in asset) {
    return asset;
  }
  const compiled = compilePlacementToPatch({
    patchId: priorFilm?.patch.id ?? newPublicId('cpt'),
    tributePublicId: tribute.publicId,
    suggestion: parsed,
    asset,
    before: timeline,
    timelineVersion: tribute.timelineVersion,
    idempotencyKey: `placement:${parsed.id}:${tribute.timelineVersion}`,
    createdAt: new Date().toISOString(),
  });
  if (!compiled.ok) {
    return { error: compiled.reason, status: 409 };
  }
  const filmPatch: FilmPatchState = {
    patch: compiled.patch,
    beforeSnapshot: timeline,
    afterSnapshot: compiled.preview,
    applyStatus: 'none',
  };

  const planned = planPlacementApply({
    current: timeline,
    currentVersion: tribute.timelineVersion,
    patch: filmPatch.patch,
    decidedByFamily: true,
  });
  if (!planned.ok) {
    return { error: planned.reason, status: 409 };
  }

  const confirmed = markPlacementSuggestionStatus(parsed, 'confirmed');
  const now = new Date().toISOString();
  const decisionPlanned = planCollaborationDecision({
    id: newPublicId('cd'),
    kind: 'placement',
    outcome: 'confirm',
    subjectType: 'placement_suggestion',
    subjectId: parsed.id,
    summary: 'Family confirmed placement',
    summaryKey: 'collab.decision.confirm',
    decidedByFamily: true,
  });
  if (!decisionPlanned.ok) {
    return { error: 'ai_cannot_decide', status: 409 };
  }
  const decisionRow: StoredCollaborationDecision = {
    schemaVersion: 1,
    id: decisionPlanned.decision.id,
    kind: decisionPlanned.decision.kind,
    outcome: decisionPlanned.decision.outcome,
    subjectType: decisionPlanned.decision.subjectType,
    subjectId: decisionPlanned.decision.subjectId,
    status: 'active',
    decidedByFamily: true,
    summary: decisionPlanned.decision.summary,
    summaryKey: decisionPlanned.decision.summaryKey,
    version: 0,
    createdAt: now,
  };

  const nextPlacements = tribute.placementSuggestions.map((item) =>
    item.id === row.id
      ? {
          ...item,
          status: confirmed.status,
          filmPatch: {
            patch: {
              ...filmPatch.patch,
              applyStatus: 'applied',
              appliedAt: now,
            },
            beforeSnapshot: filmPatch.beforeSnapshot,
            afterSnapshot: planned.next,
            applyStatus: 'applied' as const,
          },
          updatedAt: now,
        }
      : item,
  );
  const nextTasks = tribute.collaborationTasks.map((task) =>
    task.kind === 'confirm_placement' &&
    task.subjectId === parsed.id &&
    task.status === 'open'
      ? { ...task, status: 'done' as const, completedAt: now, version: task.version + 1 }
      : task,
  );

  const saved = await persistCollaborationState({
    publicId,
    placementSuggestions: nextPlacements,
    collaborationDecisions: [decisionRow, ...tribute.collaborationDecisions].slice(0, 200),
    collaborationTasks: nextTasks,
    timeline: planned.action === 'apply' ? planned.next : undefined,
    activityCode: 'placement_confirmed',
    correlationId: parsed.id,
  });
  if (!saved.ok) {
    return { error: 'not_found', status: 404 };
  }
  const overview = buildOverview(saved.tribute);
  return {
    ok: true,
    patchId: filmPatch.patch.id,
    applyStatus: 'applied',
    changeTimeline: true,
    decidedByFamily: true,
    overview,
  };
}

export async function revertOwnerPlacementPatch(
  publicId: string,
  body: { suggestionId: string },
): Promise<
  | { ok: true; patchId: string; applyStatus: 'reverted'; changeTimeline: true; overview: CollaborationOverview }
  | { error: string; status: number }
> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const row = tribute.placementSuggestions.find((s) => s.id === body.suggestionId);
  if (!row) {
    return { error: 'not_found', status: 404 };
  }
  const filmPatch = readFilmPatch(row);
  if (!filmPatch || filmPatch.applyStatus !== 'applied') {
    return { error: 'not_applied', status: 409 };
  }
  const timeline = currentTimeline(tribute);
  if (!timeline) {
    return { error: 'needs_timeline', status: 409 };
  }

  let planned = planPlacementRevert({
    current: timeline,
    patch: { ...filmPatch.patch, applyStatus: 'applied' },
  });
  if (!planned.ok) {
    const stillHasAsset = timeline.scenes.some(
      (scene) =>
        (scene.type === 'image' || scene.type === 'video') &&
        scene.asset.assetId === row.assetId,
    );
    if (stillHasAsset) {
      planned = { ok: true, next: filmPatch.beforeSnapshot, action: 'revert', changeTimeline: true };
    }
  }
  if (!planned.ok) {
    return { error: planned.reason, status: 409 };
  }

  const next = planned.action === 'revert' ? planned.next : filmPatch.beforeSnapshot;
  const now = new Date().toISOString();
  const nextPlacements = tribute.placementSuggestions.map((item) =>
    item.id === row.id
      ? {
          ...item,
          filmPatch: {
            patch: {
              ...filmPatch.patch,
              applyStatus: 'reverted',
              revertedAt: now,
            },
            beforeSnapshot: filmPatch.beforeSnapshot,
            afterSnapshot: filmPatch.afterSnapshot,
            applyStatus: 'reverted' as const,
          },
          updatedAt: now,
        }
      : item,
  );
  const saved = await persistCollaborationState({
    publicId,
    placementSuggestions: nextPlacements,
    timeline: next,
    activityCode: 'placement_confirmed',
    correlationId: row.id,
  });
  if (!saved.ok) {
    return { error: 'not_found', status: 404 };
  }
  return {
    ok: true,
    patchId: filmPatch.patch.id,
    applyStatus: 'reverted',
    changeTimeline: true,
    overview: buildOverview(saved.tribute),
  };
}

export async function recordOwnerCollaborationDecision(input: {
  publicId: string;
  kind: CollaborationDecision['kind'];
  outcome: CollaborationDecisionOutcome;
  subjectType: CollaborationSubjectType;
  subjectId: string;
  summary?: string;
  summaryKey?: string;
  relatedCommentId?: string;
  relatedConflictId?: string;
  relatedTaskId?: string;
}): Promise<
  | { ok: true; decision: CollaborationDecision; overview: CollaborationOverview }
  | { error: string; status: number }
> {
  const tribute = await getTribute(input.publicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const planned = planCollaborationDecision({
    id: newPublicId('cd'),
    kind: input.kind,
    outcome: input.outcome,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    summary: input.summary ?? input.summaryKey ?? `Family decision: ${input.outcome}`,
    summaryKey: input.summaryKey ?? `collab.decision.${input.outcome}`,
    relatedCommentId: input.relatedCommentId,
    relatedConflictId: input.relatedConflictId,
    relatedTaskId: input.relatedTaskId,
    decidedByFamily: true,
  });
  if (!planned.ok) {
    return { error: 'ai_cannot_decide', status: 409 };
  }

  const now = new Date().toISOString();
  let decisions = tribute.collaborationDecisions;
  if (input.kind === 'approval' && input.subjectType === 'final_film') {
    decisions = decisions.map((d) =>
      d.kind === 'approval' && d.subjectType === 'final_film' && d.status === 'active'
        ? { ...d, status: 'superseded' as const }
        : d,
    );
  }

  let placements = tribute.placementSuggestions;
  let tasks = tribute.collaborationTasks;
  if (
    input.kind === 'placement' &&
    input.subjectType === 'placement_suggestion' &&
    (input.outcome === 'dismiss' || input.outcome === 'confirm')
  ) {
    const status = input.outcome === 'dismiss' ? 'dismissed' : 'confirmed';
    placements = placements.map((row) =>
      row.id === input.subjectId && row.status === 'proposed'
        ? { ...row, status, updatedAt: now }
        : row,
    );
    tasks = tasks.map((task) =>
      task.kind === 'confirm_placement' &&
      task.subjectId === input.subjectId &&
      task.status === 'open'
        ? { ...task, status: 'done' as const, completedAt: now, version: task.version + 1 }
        : task,
    );
  }

  if (input.relatedTaskId) {
    tasks = tasks.map((task) =>
      task.id === input.relatedTaskId && task.status === 'open'
        ? { ...task, status: 'done' as const, completedAt: now, version: task.version + 1 }
        : task,
    );
  }

  const decisionRow: StoredCollaborationDecision = {
    schemaVersion: 1,
    id: planned.decision.id,
    kind: planned.decision.kind,
    outcome: planned.decision.outcome,
    subjectType: planned.decision.subjectType,
    subjectId: planned.decision.subjectId,
    status: 'active',
    decidedByFamily: true,
    summary: planned.decision.summary,
    summaryKey: planned.decision.summaryKey,
    relatedCommentId: input.relatedCommentId,
    relatedConflictId: input.relatedConflictId,
    relatedTaskId: input.relatedTaskId,
    version: 0,
    createdAt: now,
  };

  const saved = await persistCollaborationState({
    publicId: input.publicId,
    placementSuggestions: placements,
    collaborationDecisions: [decisionRow, ...decisions].slice(0, 200),
    collaborationTasks: tasks,
    activityCode: 'collaboration_decision',
    correlationId: planned.decision.id,
  });
  if (!saved.ok) {
    return { error: 'not_found', status: 404 };
  }
  return {
    ok: true,
    decision: planned.decision,
    overview: buildOverview(saved.tribute),
  };
}
