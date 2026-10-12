import { describe, expect, it } from 'vitest';

import {
  COLLABORATION_SUMMARY_ENGINE,
  parseCollaborationDecision,
  parseCollaborationFeedbackSummary,
  parseCollaborationPlacementPatchPreview,
  parseCollaborationPlacementSuggestion,
  parseCollaborationReviewTask,
} from './collaboration';

describe('collaboration contracts', () => {
  it('requires decidedByFamily and rejects AI-only silent winners', () => {
    const decision = parseCollaborationDecision({
      schemaVersion: 1,
      id: 'cd_test_1',
      kind: 'approval',
      outcome: 'approve',
      subjectType: 'final_film',
      subjectId: 'film',
      status: 'active',
      decidedByFamily: true,
      summary: 'Family approved the current preview',
      summaryKey: 'collab.decision.approved',
      version: 0,
    });
    expect(decision.decidedByFamily).toBe(true);
    expect(() =>
      parseCollaborationDecision({
        schemaVersion: 1,
        id: 'cd_bad',
        kind: 'fact',
        outcome: 'confirm',
        subjectType: 'story_conflict',
        subjectId: 'sc_1',
        decidedByFamily: false,
        summary: 'AI picked a winner',
      }),
    ).toThrow();
  });

  it('parses review tasks and labelled deterministic feedback summaries', () => {
    const task = parseCollaborationReviewTask({
      schemaVersion: 1,
      id: 'ct_1',
      kind: 'resolve_comment',
      status: 'open',
      subjectType: 'review_comment',
      subjectId: 'rc_1',
      labelKey: 'collab.task.resolveComment',
      version: 0,
    });
    expect(task.status).toBe('open');

    const summary = parseCollaborationFeedbackSummary({
      schemaVersion: 1,
      id: 'cfs_1',
      engine: 'deterministic',
      generativeUnavailable: true,
      openCommentCount: 1,
      resolvedCommentCount: 0,
      openConflictCount: 1,
      familyDisagreementCount: 1,
      unreviewedDuplicateCount: 0,
      openTaskCount: 2,
      activeApprovalOutcome: null,
      labelledSummaryKey: 'collab.summary.openWork',
      provenance: COLLABORATION_SUMMARY_ENGINE,
    });
    expect(summary.generativeUnavailable).toBe(true);
    expect(summary.engine).toBe('deterministic');
  });

  it('parses placement suggestions and patch previews without mutating timeline', () => {
    const suggestion = parseCollaborationPlacementSuggestion({
      schemaVersion: 1,
      id: 'cps_1',
      assetId: '11111111-1111-4111-8111-111111111111',
      status: 'proposed',
      familyMustConfirm: true,
      changeTimeline: false,
      provenance: {
        provider: COLLABORATION_SUMMARY_ENGINE.provider,
        model: 'placement-hint-v1',
        version: COLLABORATION_SUMMARY_ENGINE.version,
      },
    });
    expect(suggestion.changeTimeline).toBe(false);
    expect(suggestion.familyMustConfirm).toBe(true);

    const preview = parseCollaborationPlacementPatchPreview({
      schemaVersion: 1,
      suggestionId: suggestion.id,
      patchId: 'cpt_1',
      beforeDurationFrames: 120,
      afterDurationFrames: 240,
      touchedSceneIds: ['image-11111111-1111-4111-8111-111111111111'],
      touchedAssetIds: [suggestion.assetId],
      familyMustConfirm: true,
      changeTimeline: false,
    });
    expect(preview.changeTimeline).toBe(false);
  });
});
