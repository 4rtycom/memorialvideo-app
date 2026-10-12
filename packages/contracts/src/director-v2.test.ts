import { describe, expect, it } from 'vitest';

import {
  directorV2BriefSchema,
  directorV2OperationSchema,
  directorV2PatchSchema,
  directorV2PlanSchema,
  storyApprovalSchema,
} from './director-v2';

const provenance = {
  provider: 'deterministic-arranger',
  model: 'local-v1',
  version: 'v1',
  kind: 'deterministic' as const,
};

const sampleScene = {
  id: 'intro',
  type: 'intro' as const,
  durationFrames: 90,
  transitionIn: 'fade' as const,
  transitionOut: 'fade' as const,
  displayName: 'Alex',
};

describe('director v2 contracts', () => {
  it('stores a durable StoryPlan approval without changing the film', () => {
    const approval = storyApprovalSchema.parse({
      schemaVersion: 1,
      id: 'sap_1',
      tributePublicId: 'mv_test',
      storyPlanVersion: 1,
      storyPlanHash: 'abc12345',
      approvedChapterIds: ['ch_1'],
      approvedFactIds: ['sf_1'],
      approvedMemoryIds: ['asset-1'],
      approvedByUserId: 'user-1',
      approvedAt: '2026-08-29T18:00:00.000Z',
    });
    expect(approval.status).toBe('active');
    expect(approval.includePrivateNotes).toBe(false);
  });

  it('accepts a free-text brief without requiring structured fields', () => {
    const brief = directorV2BriefSchema.parse({
      schemaVersion: 1,
      id: 'br_1',
      naturalLanguage: 'Create a warm, dignified eight-minute memorial film focused on family.',
    });
    expect(brief.naturalLanguage.startsWith('Create a warm')).toBe(true);
    expect(brief.targetDurationSeconds).toBeUndefined();
    expect(brief.narration).toBe('none');
  });

  it('rejects voice-cloning narration values', () => {
    expect(() =>
      directorV2BriefSchema.parse({
        schemaVersion: 1,
        id: 'br_2',
        naturalLanguage: 'Clone their voice',
        narration: 'voice_clone',
      }),
    ).toThrow();
  });

  it('requires provider kind so a heuristic cannot pose as generative intelligence', () => {
    const plan = directorV2PlanSchema.parse({
      schemaVersion: 1,
      id: 'pl_1',
      tributePublicId: 'mv_test',
      briefId: 'br_1',
      approvalId: 'sap_1',
      storyPlanHash: 'abc12345',
      timelineVersion: 0,
      timelineHash: 'tlhash01',
      provenance,
      chapters: [
        {
          id: 'ch_1',
          title: 'Harbour years',
          purpose: '',
          sceneIds: ['image-asset-1'],
          durationFrames: 120,
        },
      ],
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          purpose: 'opening',
          durationFrames: 90,
          transitionIn: 'fade',
        },
      ],
      selectedAssetIds: ['asset-1'],
      openingIntent: 'name_card',
      closingIntent: 'quiet_line',
      audioIntent: { kind: 'placeholder', licensed: false },
      durationFrames: 90,
      constraintReport: [{ code: 'approved_inputs', ok: true }],
      validation: { ok: true, codes: [] },
      createdAt: '2026-08-29T18:00:00.000Z',
    });
    expect(plan.provenance.kind).toBe('deterministic');
    expect(plan.status).toBe('ready');
  });

  it('rejects arbitrary JSON mutation paths as patch operations', () => {
    expect(() =>
      directorV2OperationSchema.parse({
        op: 'json_pointer',
        path: '/scenes/0/caption',
        value: '<script>x</script>',
      }),
    ).toThrow();
    const insert = directorV2OperationSchema.parse({
      op: 'insert_scene',
      index: 0,
      scene: sampleScene,
    });
    expect(insert.op).toBe('insert_scene');
  });

  it('requires inverse operations and a resulting hash on every patch', () => {
    const patch = directorV2PatchSchema.parse({
      schemaVersion: 1,
      id: 'pt_1',
      tributePublicId: 'mv_test',
      planId: 'pl_1',
      briefId: 'br_1',
      baseTimelineVersion: 1,
      baseTimelineHash: 'beforehash0001',
      expectedTimelineHash: 'afterhash00002',
      expectedDurationFrames: 180,
      operations: [{ op: 'update_duration', sceneId: 'intro', durationFrames: 90 }],
      inverseOperations: [{ op: 'update_duration', sceneId: 'intro', durationFrames: 75 }],
      preconditions: [{ kind: 'timeline_hash', value: 'beforehash0001' }],
      touchedSceneIds: ['intro'],
      touchedAssetIds: [],
      validationStatus: 'valid',
      idempotencyKey: 'gen:mv_test:1',
      provenance,
      createdAt: '2026-08-29T18:00:00.000Z',
    });
    expect(patch.inverseOperations).toHaveLength(1);
    expect(patch.applyStatus).toBe('none');
  });
});
