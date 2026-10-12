import { describe, expect, it } from 'vitest';

import { parseTimelineContract } from '@memorialvideo/contracts';

import {
  assertConflictNeverAutoResolved,
  buildCollaborationInbox,
  buildPlacementPatchPreview,
  compilePlacementToPatch,
  deriveTasksFromSignals,
  markPlacementSuggestionStatus,
  planCollaborationDecision,
  planPlacementApply,
  proposePlacementSuggestion,
  summarizeFeedbackDeterministic,
} from './collaboration';
import { hashTimeline } from './director-v2';

function baseTimeline() {
  return parseTimelineContract({
    schemaVersion: 1,
    displayName: 'Placement test',
    fps: 30,
    width: 1920,
    height: 1080,
    themeKey: 'timeless',
    watermark: true,
    seed: 7,
    locale: 'en',
    scenes: [
      {
        id: 'sc_intro',
        type: 'intro',
        durationFrames: 60,
        transitionIn: 'fade',
        transitionOut: 'fade',
        displayName: 'Placement test',
      },
      {
        id: 'sc_img',
        type: 'image',
        durationFrames: 120,
        transitionIn: 'fade',
        transitionOut: 'fade',
        asset: { assetId: 'owner-photo', src: 'storage://project-originals/owner.png' },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
      {
        id: 'sc_outro',
        type: 'outro',
        durationFrames: 60,
        transitionIn: 'fade',
        transitionOut: 'fade',
        closingLine: 'With love',
      },
    ],
  });
}

describe('family collaboration domain', () => {
  it('builds an inbox that flags conflicts without auto-resolving them', () => {
    const inbox = buildCollaborationInbox({
      comments: [{ id: 'rc1', resolved: false, timecodeMs: 1200 }],
      conflicts: [
        { id: 'sc1', state: 'needs_input', familyDisagreement: true },
        { id: 'sc2', state: 'resolved', familyDisagreement: true },
      ],
      duplicates: [{ pairId: 'dup1', reviewState: 'unreviewed' }],
      tasks: [],
      activeFinalApproval: null,
    });
    expect(inbox.some((item) => item.kind === 'open_conflict' && item.aiMayNotDecide)).toBe(true);
    expect(inbox.some((item) => item.kind === 'open_comment')).toBe(true);
    expect(inbox.some((item) => item.kind === 'unreviewed_duplicate')).toBe(true);
    expect(inbox.every((item) => item.familyMustDecide)).toBe(true);
    expect(assertConflictNeverAutoResolved({ id: 'x', state: 'auto_merged', familyDisagreement: true })).toBe(
      false,
    );
  });

  it('rejects decisions that are not family-authored', () => {
    const planned = planCollaborationDecision({
      id: 'cd1',
      kind: 'approval',
      outcome: 'approve',
      subjectType: 'final_film',
      subjectId: 'film',
      summary: 'Family approved',
      summaryKey: 'collab.decision.approve',
      decidedByFamily: true,
    });
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.decision.decidedByFamily).toBe(true);
    }
  });

  it('summarizes feedback with counts only and marks generative unavailable', () => {
    const summary = summarizeFeedbackDeterministic({
      summaryId: 'cfs1',
      comments: [
        { id: 'a', resolved: false, timecodeMs: 0 },
        { id: 'b', resolved: true, timecodeMs: 10 },
      ],
      conflicts: [{ id: 'c', state: 'needs_input', familyDisagreement: true }],
      duplicates: [],
      tasks: [],
      activeFinalApproval: null,
    });
    expect(summary.openCommentCount).toBe(1);
    expect(summary.resolvedCommentCount).toBe(1);
    expect(summary.familyDisagreementCount).toBe(1);
    expect(summary.generativeUnavailable).toBe(true);
    expect(summary.engine).toBe('deterministic');
  });

  it('proposes placement without mutating the timeline', () => {
    const suggestion = proposePlacementSuggestion({
      id: 'cps1',
      assetId: 'asset_1',
      suggestedSortHint: 2,
    });
    expect(suggestion.changeTimeline).toBe(false);
    expect(suggestion.familyMustConfirm).toBe(true);
    expect(suggestion.status).toBe('proposed');
  });

  it('compiles placement to insert_scene patch with preview-only changeTimeline false', () => {
    const before = baseTimeline();
    const beforeHash = hashTimeline(before);
    const suggestion = proposePlacementSuggestion({
      id: 'cps_place',
      assetId: 'contrib-photo',
    });
    const compiled = compilePlacementToPatch({
      patchId: 'cpt_1',
      tributePublicId: 'mv_test',
      suggestion,
      asset: {
        id: 'contrib-photo',
        kind: 'image',
        src: 'storage://project-originals/contrib.png',
      },
      before,
      timelineVersion: 3,
      idempotencyKey: 'place:cps_place:v3',
      createdAt: new Date().toISOString(),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }
    expect(compiled.changeTimeline).toBe(false);
    expect(compiled.patch.operations).toEqual([
      expect.objectContaining({ op: 'insert_scene' }),
    ]);
    expect(compiled.preview.scenes.some((scene) => scene.type === 'image' && scene.asset.assetId === 'contrib-photo')).toBe(
      true,
    );
    expect(hashTimeline(before)).toBe(beforeHash);
    const previewMeta = buildPlacementPatchPreview({
      suggestionId: suggestion.id,
      patch: compiled.patch,
      before,
      preview: compiled.preview,
    });
    expect(previewMeta.changeTimeline).toBe(false);
    expect(previewMeta.afterDurationFrames).toBeGreaterThan(previewMeta.beforeDurationFrames);

    const applied = planPlacementApply({
      current: before,
      currentVersion: 3,
      patch: compiled.patch,
      decidedByFamily: true,
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.changeTimeline).toBe(true);
      expect(applied.next.scenes.some((s) => s.type === 'image' && s.asset.assetId === 'contrib-photo')).toBe(
        true,
      );
    }

    expect(
      compilePlacementToPatch({
        patchId: 'cpt_dup',
        tributePublicId: 'mv_test',
        suggestion,
        asset: { id: 'contrib-photo', kind: 'image', src: 'storage://project-originals/contrib.png' },
        before: applied.ok ? applied.next : before,
        timelineVersion: 4,
        idempotencyKey: 'place:dup',
        createdAt: new Date().toISOString(),
      }).ok,
    ).toBe(false);

    expect(markPlacementSuggestionStatus(suggestion, 'confirmed').changeTimeline).toBe(false);
  });

  it('honors never_include locks and derives confirm_placement tasks', () => {
    const suggestion = proposePlacementSuggestion({ id: 'cps_lock', assetId: 'locked-asset' });
    const locked = compilePlacementToPatch({
      patchId: 'cpt_lock',
      tributePublicId: 'mv_test',
      suggestion,
      asset: { id: 'locked-asset', kind: 'image', src: 'storage://project-originals/x.png' },
      before: baseTimeline(),
      timelineVersion: 1,
      locks: [{ kind: 'never_include', targetId: 'locked-asset' }],
      idempotencyKey: 'place:lock',
      createdAt: new Date().toISOString(),
    });
    expect(locked).toMatchObject({ ok: false, reason: 'manual_lock', changeTimeline: false });

    const tasks = deriveTasksFromSignals({
      comments: [{ id: 'rc1', resolved: false, timecodeMs: 0 }],
      conflicts: [{ id: 'sc1', state: 'open', familyDisagreement: true }],
      duplicates: [],
      placementSuggestions: [suggestion],
      existing: [],
      idFactory: (kind, subjectId) => `${kind}_${subjectId}`,
    });
    expect(tasks.some((t) => t.kind === 'confirm_placement')).toBe(true);
    expect(tasks.some((t) => t.kind === 'review_conflict')).toBe(true);
  });
});
