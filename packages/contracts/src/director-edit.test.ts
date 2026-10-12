import { describe, expect, it } from 'vitest';

import {
  directorHistoryEntrySchema,
  editIntentSchema,
  editPlanSchema,
  naturalLanguageEditRequestSchema,
} from './director-edit';

const provenance = {
  provider: 'deterministic-edit-interpreter',
  model: 'local-v1',
  version: 'v1',
  kind: 'deterministic' as const,
};

describe('director edit contracts', () => {
  it('accepts a natural-language edit request without applying the film', () => {
    const request = naturalLanguageEditRequestSchema.parse({
      schemaVersion: 1,
      id: 'er_1',
      tributePublicId: 'mv_test',
      locale: 'en',
      instruction: 'Make the childhood chapter shorter.',
      selectedChapterId: 'ch_1',
      baseTimelineVersion: 2,
      baseTimelineHash: 'abcdef12',
      storyPlanHash: '12345678',
      createdByUserId: 'user-1',
      createdAt: '2026-08-30T08:00:00.000Z',
      idempotencyKey: 'edit-1',
    });
    expect(request.status).toBe('received');
    expect(request.providerMode).toBe('deterministic');
  });

  it('rejects unknown intent types from the closed allowlist', () => {
    expect(() =>
      editIntentSchema.parse({
        schemaVersion: 1,
        id: 'ei_1',
        requestId: 'er_1',
        type: 'scene.invent_biography',
        scope: 'scene',
        capabilityStatus: 'supported',
        provenance,
      }),
    ).toThrow();
  });

  it('stores an edit plan with before/after duration impact', () => {
    const plan = editPlanSchema.parse({
      schemaVersion: 1,
      id: 'ep_1',
      requestId: 'er_1',
      intentId: 'ei_1',
      interpretation: ['Shorten the selected chapter by about 20%.'],
      proposedOperationKinds: ['update_duration'],
      preservedSceneIds: ['intro', 'outro'],
      affectedSceneIds: ['img-1'],
      affectedChapterIds: ['ch_1'],
      changes: [
        {
          kind: 'duration',
          sceneId: 'img-1',
          chapterId: 'ch_1',
          beforeDurationFrames: 180,
          afterDurationFrames: 144,
        },
      ],
      beforeDurationFrames: 600,
      afterDurationFrames: 564,
      capabilityStatus: 'supported',
      createdAt: '2026-08-30T08:00:00.000Z',
    });
    expect(plan.clarificationRequired).toBe(false);
  });

  it('records a safe history entry without private instruction text', () => {
    const entry = directorHistoryEntrySchema.parse({
      schemaVersion: 1,
      id: 'dh_1',
      kind: 'nl_edit',
      status: 'applied',
      safeActionKey: 'director.edit_requested',
      timelineVersion: 3,
      timelineHash: 'abcdef12',
      patchId: 'pt_1',
      createdAt: '2026-08-30T08:00:00.000Z',
    });
    expect(entry).not.toHaveProperty('instruction');
  });
});
