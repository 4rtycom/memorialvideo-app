import { describe, expect, it } from 'vitest';

import { buildInitialTimeline } from './sequence';

import {
  canOwnerAccessTribute,
  canReenterProject,
  createProjectPublicId,
  isProjectPublicId,
  isStaleWrite,
  mergeStoredProjectDraft,
  parseProjectDraft,
  rewriteDraftTimelineSrcs,
  planOwnerResourceAccess,
  summarizeOwnerTribute,
  summarizeRenderState,
  unpaidRetentionDeadline,
} from './project';

describe('project helpers', () => {
  it('creates an opaque public id', () => {
    expect(createProjectPublicId(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'mv_aaaaaaaabbbbcccc',
    );
  });

  it('schedules unpaid retention thirty days out', () => {
    const from = new Date('2026-08-27T00:00:00.000Z');
    expect(unpaidRetentionDeadline(from).toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('blocks re-entry after deletion starts', () => {
    expect(canReenterProject('DRAFT')).toBe(true);
    expect(canReenterProject('DELETION_PENDING')).toBe(false);
  });

  it('rejects an empty memorial name', () => {
    expect(() => parseProjectDraft({ displayName: '   ' })).toThrow();
  });

  it('detects a stale autosave', () => {
    expect(isStaleWrite('2026-08-27T10:00:00.000Z', '2026-08-27T10:00:01.000Z')).toBe(true);
    expect(isStaleWrite('2026-08-27T10:00:00.000Z', '2026-08-27T10:00:00.000Z')).toBe(false);
  });

  it('stores a ceremony date without a person name', () => {
    const draft = parseProjectDraft({
      displayName: 'Alex Rivera',
      ceremonyDate: '2026-09-12',
      ceremonyTimezone: 'Europe/Warsaw',
    });
    expect(draft.ceremonyDate).toBe('2026-09-12');
    expect(draft.ceremonyTimezone).toBe('Europe/Warsaw');
  });

  it('persists story items without filenames', () => {
    const draft = parseProjectDraft({
      displayName: 'Alex Rivera',
      step: 'story',
      storyItems: [
        {
          assetId: '22222222-2222-4222-8222-222222222222',
          kind: 'image',
          caption: 'Garden',
          durationSeconds: 5,
          focalX: 0.3,
          focalY: 0.7,
          zoom: 1.4,
          transitionIn: 'fade',
        },
      ],
    });
    expect(draft.step).toBe('story');
    expect(draft.storyItems).toEqual([
      {
        assetId: '22222222-2222-4222-8222-222222222222',
        kind: 'image',
        caption: 'Garden',
        durationSeconds: 5,
        focalX: 0.3,
        focalY: 0.7,
        zoom: 1.4,
        transitionIn: 'fade',
      },
    ]);
    expect(JSON.stringify(draft.storyItems)).not.toMatch(/\.jpg|\.png|filename/i);
  });

  it('accepts up to eight chapter titles', () => {
    const draft = parseProjectDraft({
      displayName: 'Alex Rivera',
      chapters: ['Early years', 'Later years'],
    });
    expect(draft.chapters).toEqual(['Early years', 'Later years']);
  });

  it('accepts only opaque project public ids', () => {
    expect(isProjectPublicId('mv_aaaaaaaabbbbcccc')).toBe(true);
    expect(isProjectPublicId('1')).toBe(false);
    expect(isProjectPublicId('projects/1')).toBe(false);
  });

  it('summarizes a tribute without filenames', () => {
    const summary = summarizeOwnerTribute({
      publicId: 'mv_aaaaaaaabbbbcccc',
      displayName: 'Alex Rivera',
      updatedAt: '2026-08-28T00:00:00.000Z',
      scheduledDeleteAt: null,
      draft: parseProjectDraft({ displayName: 'Alex Rivera', desk: 'studio', themeKey: 'warm_light' }),
    });
    expect(summary.desk).toBe('studio');
    expect(summary.themeKey).toBe('warm_light');
    expect(summary.renderState).toBe('none');
    expect(summary.hasPoster).toBe(false);
    expect(summary.latestJobId).toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(/\.jpg|\.png|filename/i);
  });

  it('keeps tribute reads on the owner and rejects an invalid stored timeline', () => {
    expect(
      canOwnerAccessTribute({
        actorUserId: 'owner',
        ownerUserId: 'owner',
        lifecycleStatus: 'DRAFT',
      }),
    ).toBe(true);
    expect(
      canOwnerAccessTribute({
        actorUserId: 'stranger',
        ownerUserId: 'owner',
        lifecycleStatus: 'DRAFT',
      }),
    ).toBe(false);
    expect(
      canOwnerAccessTribute({
        actorUserId: 'owner',
        ownerUserId: 'owner',
        lifecycleStatus: 'DELETION_PENDING',
      }),
    ).toBe(false);
    expect(planOwnerResourceAccess({ actorUserId: null, ownerUserId: 'owner', lifecycleStatus: 'DRAFT' })).toBe(
      'unauthorized',
    );
    expect(planOwnerResourceAccess({ actorUserId: 'stranger', ownerUserId: 'owner', lifecycleStatus: 'DRAFT' })).toBe(
      'not_found',
    );
    expect(planOwnerResourceAccess({ actorUserId: 'owner', ownerUserId: 'owner', lifecycleStatus: 'ACTIVE' })).toBe(
      'ok',
    );
    expect(summarizeRenderState('RENDERING')).toBe('processing');
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      locale: 'en',
      themeKey: 'timeless',
      assets: [{ id: 'asset-1', type: 'image', src: 'asset://asset-1', capturedAt: null }],
    });
    const draft = parseProjectDraft({ displayName: 'Alex Rivera', timeline });
    expect(draft.timeline?.displayName).toBe('Alex Rivera');
    expect(() => parseProjectDraft({ displayName: 'Alex Rivera', timeline: { schemaVersion: 1 } })).toThrow();
    const kept = mergeStoredProjectDraft(draft, parseProjectDraft({ displayName: 'Alex Rivera' }));
    expect(kept.timeline?.scenes.some((scene) => scene.type === 'image')).toBe(true);
    const incoming = parseProjectDraft({
      displayName: 'Alex Rivera',
      timeline: {
        ...timeline,
        scenes: timeline.scenes.map((scene) =>
          scene.type === 'image' || scene.type === 'video'
            ? { ...scene, asset: { ...scene.asset, src: 'data:image/png;base64,xx' } }
            : scene,
        ),
      },
    });
    const merged = mergeStoredProjectDraft(draft, incoming);
    const image = merged.timeline?.scenes.find((scene) => scene.type === 'image');
    expect(image && (image.type === 'image' || image.type === 'video') ? image.asset.src : '').toBe(
      'asset://asset-1',
    );
    const rewritten = rewriteDraftTimelineSrcs(timeline, [{ assetId: 'asset-1', variantKey: 'projects/p1/v.jpg' }]);
    const rewrittenImage = rewritten.scenes.find((scene) => scene.type === 'image');
    expect(rewrittenImage && rewrittenImage.type === 'image' ? rewrittenImage.asset.src : '').toBe(
      'storage://project-variants/projects/p1/v.jpg',
    );
  });

  it('stores a director run without filenames or media content', () => {
    const draft = parseProjectDraft({
      displayName: 'Alex Rivera',
      aspect: '9:16',
      desk: 'guided',
      directorRun: {
        id: 'dir-1',
        action: 'first_cut',
        reasons: ['pace_from_count'],
        appliedAt: '2026-08-28T00:00:00.000Z',
      },
      directorBefore: {
        chapterTitle: '',
        chapters: [],
        music: 'none',
        files: [{ localId: 'photo-0', assetId: 'asset-1', durationSeconds: 8, transitionIn: 'none' }],
      },
    });
    expect(draft.directorRun?.action).toBe('first_cut');
    expect(draft.aspect).toBe('9:16');
    expect(JSON.stringify(draft.directorBefore)).not.toMatch(/\.jpg|\.png|filename/i);
  });
});
