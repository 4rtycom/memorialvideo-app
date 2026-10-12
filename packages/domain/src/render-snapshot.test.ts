import { describe, expect, it } from 'vitest';

import { evaluateOutputQc } from './output-qc';
import { planCancel, planRenderEnqueue, reconcileStaleJobs } from './render-plan';
import { buildRenderSnapshot } from './render-snapshot';

const timeline = {
  schemaVersion: 1,
  fps: 30,
  width: 1920,
  height: 1080,
  seed: 11,
  locale: 'en',
  themeKey: 'timeless',
  watermark: true,
  displayName: 'Alex Rivera',
  scenes: [
    {
      id: 'intro',
      type: 'intro',
      durationFrames: 90,
      displayName: 'Alex Rivera',
      transitionIn: 'fade',
      transitionOut: 'fade',
    },
    {
      id: 'image-1',
      type: 'image',
      durationFrames: 120,
      asset: { assetId: 'asset-1', src: 'memory://local' },
      transitionIn: 'dissolve',
      transitionOut: 'fade',
    },
    {
      id: 'outro',
      type: 'outro',
      durationFrames: 90,
      closingLine: 'Always remembered.',
      transitionIn: 'fade',
      transitionOut: 'none',
    },
  ],
};

const readyAsset = {
  assetId: 'asset-1',
  projectId: 'project-1',
  status: 'READY' as const,
  sha256: 'a'.repeat(64),
  storageKey: 'projects/project-1/assets/asset-1/original',
  variantKey: 'projects/project-1/assets/asset-1/variants/normalized-v1',
};

describe('render snapshot', () => {
  it('locks ready assets and hashes equivalent specs the same way', () => {
    const first = buildRenderSnapshot({
      kind: 'preview',
      timeline,
      assets: [readyAsset],
      projectId: 'project-1',
      themeBuildSha: 'theme-sha',
    });
    const second = buildRenderSnapshot({
      kind: 'preview',
      timeline,
      assets: [readyAsset],
      projectId: 'project-1',
      themeBuildSha: 'theme-sha',
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.snapshotHash).toBe(second.snapshotHash);
      expect(first.spec.timeline.scenes[1]).toMatchObject({
        type: 'image',
        asset: { checksum: readyAsset.sha256 },
      });
    }
  });

  it('preserves film-approved enhancement variant src in the locked snapshot', () => {
    const enhancedTimeline = {
      ...timeline,
      scenes: timeline.scenes.map((scene) =>
        scene.type === 'image'
          ? {
              ...scene,
              asset: {
                assetId: 'asset-1',
                src: 'storage://project-variants/projects/project-1/assets/asset-1/variants/enhancement-ev1.jpg',
                enhancementVariantId: 'ev_1',
              },
            }
          : scene,
      ),
    };
    const built = buildRenderSnapshot({
      kind: 'preview',
      timeline: enhancedTimeline,
      assets: [readyAsset],
      projectId: 'project-1',
      themeBuildSha: 'theme-sha',
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      const image = built.spec.timeline.scenes.find((scene) => scene.type === 'image');
      expect(image?.type === 'image' && image.asset.src).toBe(
        'storage://project-variants/projects/project-1/assets/asset-1/variants/enhancement-ev1.jpg',
      );
      expect(image?.type === 'image' && image.asset.enhancementVariantId).toBe('ev_1');
    }
  });

  it('preserves Finish-derived src for Remotion parity when finishJobId is bound (MV-130)', () => {
    const finishSrc =
      'storage://project-variants/projects/project-1/assets/asset-1/variants/finish-fn_abc.mp4';
    const finishTimeline = {
      ...timeline,
      scenes: [
        {
          id: 'intro',
          type: 'intro' as const,
          durationFrames: 90,
          displayName: 'Alex Rivera',
          transitionIn: 'fade' as const,
          transitionOut: 'fade' as const,
        },
        {
          type: 'video' as const,
          id: 'v1',
          durationFrames: 30,
          transitionIn: 'fade' as const,
          transitionOut: 'fade' as const,
          asset: {
            assetId: 'asset-1',
            src: finishSrc,
            finishJobId: 'fn_abc',
          },
        },
        {
          id: 'outro',
          type: 'outro' as const,
          durationFrames: 90,
          closingLine: 'Always remembered.',
          transitionIn: 'fade' as const,
          transitionOut: 'none' as const,
        },
      ],
    };
    const built = buildRenderSnapshot({
      kind: 'preview',
      timeline: finishTimeline,
      assets: [readyAsset],
      projectId: 'project-1',
      themeBuildSha: 'theme-sha',
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      const video = built.spec.timeline.scenes.find((scene) => scene.type === 'video');
      expect(video?.type === 'video' && video.asset.src).toBe(finishSrc);
      expect(video?.type === 'video' && video.asset.finishJobId).toBe('fn_abc');
    }
  });

  it('rejects foreign, unready, watermark and music-rights problems', () => {
    expect(
      buildRenderSnapshot({
        kind: 'preview',
        timeline,
        assets: [{ ...readyAsset, status: 'PROCESSING' }],
        projectId: 'project-1',
        themeBuildSha: 'theme-sha',
      }).ok,
    ).toBe(false);
    expect(
      buildRenderSnapshot({
        kind: 'preview',
        timeline,
        assets: [{ ...readyAsset, projectId: 'other' }],
        projectId: 'project-1',
        themeBuildSha: 'theme-sha',
      }),
    ).toEqual({ ok: false, error: 'foreign_asset' });
    expect(
      buildRenderSnapshot({
        kind: 'final',
        timeline,
        assets: [readyAsset],
        projectId: 'project-1',
        themeBuildSha: 'theme-sha',
      }),
    ).toEqual({ ok: false, error: 'watermark_mismatch' });
    expect(
      buildRenderSnapshot({
        kind: 'preview',
        timeline,
        assets: [readyAsset],
        projectId: 'project-1',
        themeBuildSha: 'theme-sha',
        music: {
          trackId: 'user-1',
          licensedForDownload: true,
          licensedForPrivateStream: true,
          userUploaded: true,
          featureUserUploads: false,
        },
      }),
    ).toEqual({ ok: false, error: 'music_rights' });
  });
});

describe('render plan', () => {
  it('reuses READY or active jobs and denies finals without entitlement', () => {
    expect(
      planRenderEnqueue({
        kind: 'preview',
        snapshotHash: 'abc',
        existing: [{ id: 'j1', kind: 'preview', snapshotHash: 'abc', status: 'READY' }],
        entitlement: null,
        previewUsed: 0,
      }),
    ).toEqual({ action: 'reuse_ready', jobId: 'j1' });
    expect(
      planRenderEnqueue({
        kind: 'preview',
        snapshotHash: 'abc',
        existing: [{ id: 'j2', kind: 'preview', snapshotHash: 'abc', status: 'RENDERING' }],
        entitlement: null,
        previewUsed: 0,
      }),
    ).toEqual({ action: 'reuse_active', jobId: 'j2' });
    expect(
      planRenderEnqueue({
        kind: 'final',
        snapshotHash: 'abc',
        existing: [],
        entitlement: null,
        previewUsed: 0,
      }),
    ).toEqual({ action: 'deny', reason: 'entitlement_required' });
    expect(
      planRenderEnqueue({
        kind: 'preview',
        snapshotHash: 'new',
        existing: [],
        entitlement: null,
        previewUsed: 0,
      }),
    ).toEqual({ action: 'enqueue', idempotencyKey: 'preview:new' });
    expect(
      planRenderEnqueue({
        kind: 'preview',
        snapshotHash: 'over',
        existing: [],
        entitlement: null,
        previewUsed: 8,
      }),
    ).toEqual({ action: 'deny', reason: 'preview_quota' });
    expect(planCancel('QUEUED')).toBe('CANCELED');
    expect(planCancel('READY')).toBeNull();
    expect(
      reconcileStaleJobs(
        [{ id: 'stale', kind: 'preview', snapshotHash: 'x', status: 'RENDERING', lastHeartbeatAt: '2026-01-01T00:00:00.000Z' }],
        Date.parse('2026-01-01T00:20:00.000Z'),
      ),
    ).toEqual([{ jobId: 'stale', next: 'FAILED_RETRYABLE' }]);
  });
});

describe('output qc', () => {
  it('only marks READY when 1080p, duration and audio match', () => {
    expect(
      evaluateOutputQc({
        expectedDurationSeconds: 19.56,
        requireAudio: true,
        probe: {
          exists: true,
          sizeBytes: 1_000_000,
          width: 1920,
          height: 1080,
          durationSeconds: 19.56,
          hasVideo: true,
          hasAudio: true,
          container: 'mp4',
        },
      }).ready,
    ).toBe(true);
    expect(
      evaluateOutputQc({
        expectedDurationSeconds: 19.56,
        requireAudio: true,
        probe: {
          exists: true,
          sizeBytes: 12,
          width: 1280,
          height: 720,
          durationSeconds: 2,
          hasVideo: true,
          hasAudio: false,
          container: 'mp4',
        },
      }).failures,
    ).toEqual(['resolution', 'audio_missing', 'duration']);
  });
});
