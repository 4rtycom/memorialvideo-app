import { describe, expect, it } from 'vitest';

import {
  parseTimelineContract,
  type DirectorV2Brief,
  type NaturalLanguageEditRequest,
  type StoryApproval,
  type StoryPlan,
  type TimelineContract,
} from '@memorialvideo/contracts';

import {
  compileEditIntentToPatch,
  detectPatchOverlap,
  interpretDeterministicEdit,
  sanitizeEditInstruction,
} from './director-edit';
import { hashStoryPlan, hashTimeline, hashUnaffectedScenes } from './director-v2';

const now = '2026-08-30T08:00:00.000Z';

function timeline(): TimelineContract {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed: 1,
    displayName: 'Alex',
    themeKey: 'timeless',
    watermark: true,
    locale: 'en',
    scenes: [
      { id: 'intro', type: 'intro', durationFrames: 90, transitionIn: 'fade', transitionOut: 'fade', displayName: 'Alex' },
      { id: 'chapter-ch1', type: 'chapter', durationFrames: 75, transitionIn: 'fade', transitionOut: 'fade', title: 'Childhood' },
      {
        id: 'image-a1',
        type: 'image',
        durationFrames: 180,
        transitionIn: 'dissolve',
        transitionOut: 'fade',
        asset: { assetId: 'a1', src: 'storage://a1' },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
      {
        id: 'image-a2',
        type: 'image',
        durationFrames: 180,
        transitionIn: 'dissolve',
        transitionOut: 'fade',
        asset: { assetId: 'a2', src: 'storage://a2' },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
      { id: 'chapter-ch2', type: 'chapter', durationFrames: 75, transitionIn: 'fade', transitionOut: 'fade', title: 'Later' },
      {
        id: 'image-a3',
        type: 'image',
        durationFrames: 150,
        transitionIn: 'dissolve',
        transitionOut: 'fade',
        asset: { assetId: 'a3', src: 'storage://a3' },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
      { id: 'outro', type: 'outro', durationFrames: 90, transitionIn: 'fade', transitionOut: 'fade', closingLine: 'Alex' },
    ],
  });
}

function storyPlan(): StoryPlan {
  return {
    schemaVersion: 1,
    title: '',
    narrativeMode: 'chronological',
    chapters: [
      { id: 'ch1', title: 'Childhood', purpose: '', assetIds: ['a1', 'a2'], factIds: [] },
      { id: 'ch2', title: 'Later', purpose: '', assetIds: ['a3'], factIds: [] },
    ],
    recommendations: [],
    confirmedFactIds: [],
    approvedExcerptIds: [],
    approvedPersonIds: [],
    warnings: [],
    unresolvedConflictIds: [],
    openQuestionIds: [],
    ready: true,
    changeTimeline: false,
  };
}

function approval(): StoryApproval {
  return {
    schemaVersion: 1,
    id: 'sap_1',
    tributePublicId: 'mv_test',
    storyPlanVersion: 1,
    storyPlanHash: hashStoryPlan(storyPlan()),
    approvedChapterIds: ['ch1', 'ch2'],
    approvedFactIds: [],
    approvedMemoryIds: ['a1', 'a2', 'a3', 'a4'],
    excludedChapterIds: [],
    excludedFactIds: [],
    excludedMemoryIds: [],
    includePrivateNotes: false,
    approvedByUserId: 'user-1',
    approvedAt: now,
    version: 0,
    status: 'active',
  };
}

function brief(): DirectorV2Brief {
  return {
    schemaVersion: 1,
    id: 'br_1',
    naturalLanguage: 'Warm film',
    themeKeys: [],
    emphasiseChapterIds: [],
    shortenChapterIds: [],
    excludeChapterIds: [],
    mustIncludeMemoryIds: [],
    mustExcludeMemoryIds: [],
    narration: 'none',
    musicMood: 'placeholder',
    musicRightsAccepted: false,
    protectedLocks: [],
    reducedMotion: false,
    captionsPreferred: false,
    clarifyingQuestions: [],
    version: 0,
    ceremonyContext: '',
  };
}

function request(partial: Partial<NaturalLanguageEditRequest> & Pick<NaturalLanguageEditRequest, 'instruction'>): NaturalLanguageEditRequest {
  const base = timeline();
  return {
    schemaVersion: 1,
    id: 'er_1',
    tributePublicId: 'mv_test',
    locale: 'en',
    scope: partial.scope,
    selectedSceneId: partial.selectedSceneId,
    selectedChapterId: partial.selectedChapterId,
    selectedAssetId: partial.selectedAssetId,
    replacementAssetId: partial.replacementAssetId,
    baseTimelineVersion: 1,
    baseTimelineHash: hashTimeline(base),
    storyPlanHash: hashStoryPlan(storyPlan()),
    providerMode: 'deterministic',
    status: 'received',
    clarifyingQuestions: [],
    clarificationAnswers: partial.clarificationAnswers ?? {},
    createdByUserId: 'user-1',
    createdAt: now,
    retentionState: 'active',
    idempotencyKey: 'edit-1',
    ...partial,
  };
}

const assets = [
  { id: 'a1', src: 'storage://a1', kind: 'image' as const },
  { id: 'a2', src: 'storage://a2', kind: 'image' as const },
  { id: 'a3', src: 'storage://a3', kind: 'image' as const },
  { id: 'a4', src: 'storage://a4', kind: 'image' as const },
];

describe('director edit domain', () => {
  it('strips script tags from instructions treated as data', () => {
    expect(sanitizeEditInstruction('<script>alert(1)</script>Shorten this scene')).toBe('alert(1) Shorten this scene');
  });

  it('shortens a selected scene through a typed intent and patch', () => {
    const interpreted = interpretDeterministicEdit({
      request: request({ instruction: 'Shorten this scene', selectedSceneId: 'image-a1', scope: 'scene' }),
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
    });
    expect(interpreted.ok).toBe(true);
    expect(interpreted.intent.type).toBe('scene.adjust_duration');
    const compiled = compileEditIntentToPatch({
      intent: interpreted.intent,
      request: request({ instruction: 'Shorten this scene', selectedSceneId: 'image-a1', scope: 'scene' }),
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
      brief: brief(),
      assets,
      patchId: 'pt_edit',
      planId: 'pl_edit',
      briefId: 'br_1',
      timelineVersion: 1,
      idempotencyKey: 'edit-scene',
      createdAt: now,
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }
    expect(compiled.changeTimeline).toBe(false);
    const after = compiled.preview.scenes.find((scene) => scene.id === 'image-a1');
    expect(after?.durationFrames).toBeLessThan(180);
    expect(compiled.plan.unchangedHash).toBe(hashUnaffectedScenes(timeline(), ['image-a1']));
  });

  it('keeps other chapter hashes identical when shortening one chapter', () => {
    const req = request({ instruction: 'Shorten this chapter by about 20%', selectedChapterId: 'ch1', scope: 'chapter' });
    const interpreted = interpretDeterministicEdit({
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
    });
    expect(interpreted.ok).toBe(true);
    const compiled = compileEditIntentToPatch({
      intent: interpreted.intent,
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
      brief: brief(),
      assets,
      patchId: 'pt_ch',
      planId: 'pl_ch',
      briefId: 'br_1',
      timelineVersion: 1,
      idempotencyKey: 'edit-ch',
      createdAt: now,
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }
    expect(compiled.plan.unchangedHash).toBe(hashUnaffectedScenes(timeline(), compiled.patch.touchedSceneIds));
    expect(compiled.patch.touchedSceneIds.every((id) => !id.includes('a3'))).toBe(true);
  });

  it('answers unsupported person-removal honestly', () => {
    const interpreted = interpretDeterministicEdit({
      request: request({ instruction: 'Remove every photo containing this person' }),
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
    });
    expect(interpreted.ok).toBe(false);
    expect(interpreted.intent.capabilityStatus).toBe('impossible');
    expect(interpreted.intent.capabilityCode).toBe('person_detection_unavailable');
  });

  it('asks for clarification on emotional requests', () => {
    const interpreted = interpretDeterministicEdit({
      request: request({ instruction: 'Make this section less sad', selectedChapterId: 'ch1' }),
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
    });
    expect(interpreted.ok).toBe(false);
    expect(interpreted.intent.capabilityStatus).toBe('needs_clarification');
    expect(interpreted.intent.clarifyingQuestions[0]?.code).toBe('emotion_axis');
  });

  it('rejects keep-duration lock conflicts', () => {
    const req = request({ instruction: 'Shorten this scene', selectedSceneId: 'image-a1', scope: 'scene' });
    const interpreted = interpretDeterministicEdit({
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
      locks: [{ kind: 'keep_duration', targetId: 'image-a1' }],
    });
    const compiled = compileEditIntentToPatch({
      intent: interpreted.intent,
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
      brief: brief(),
      assets,
      patchId: 'pt_lock',
      planId: 'pl_lock',
      briefId: 'br_1',
      timelineVersion: 1,
      idempotencyKey: 'edit-lock',
      createdAt: now,
    });
    expect(compiled.ok).toBe(false);
  });

  it('detects overlapping manual edits', () => {
    const req = request({ instruction: 'Shorten this scene', selectedSceneId: 'image-a1', scope: 'scene' });
    const interpreted = interpretDeterministicEdit({
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
    });
    const compiled = compileEditIntentToPatch({
      intent: interpreted.intent,
      request: req,
      timeline: timeline(),
      storyPlan: storyPlan(),
      approval: approval(),
      brief: brief(),
      assets,
      patchId: 'pt_ov',
      planId: 'pl_ov',
      briefId: 'br_1',
      timelineVersion: 1,
      idempotencyKey: 'edit-ov',
      createdAt: now,
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }
    const drifted = parseTimelineContract({
      ...compiled.preview,
      scenes: compiled.preview.scenes.map((scene) =>
        scene.id === 'image-a2' ? { ...scene, durationFrames: 200 } : scene,
      ),
    });
    expect(detectPatchOverlap({ patch: compiled.patch, current: drifted }).overlaps).toBe(true);
  });
});
