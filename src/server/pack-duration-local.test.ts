import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FPS, parseTimelineContract, VIDEO_MAX_FRAMES } from '@memorialvideo/contracts';

function timelineForSeconds(seconds: number) {
  const totalFrames = Math.round(seconds * DEFAULT_FPS);
  const scenes: Array<Record<string, unknown>> = [
    {
      id: 'intro',
      type: 'intro',
      durationFrames: 90,
      displayName: 'Intro',
      transitionIn: 'fade',
      transitionOut: 'fade',
    },
  ];
  let remaining = Math.max(0, totalFrames - 90);
  let index = 0;
  while (remaining > 0) {
    const durationFrames = Math.min(VIDEO_MAX_FRAMES, remaining);
    scenes.push({
      id: `vid-${index}`,
      type: 'video',
      durationFrames,
      transitionIn: 'fade',
      transitionOut: 'fade',
      asset: {
        assetId: `asset-${index}`,
        src: `/fixtures/memory-${(index % 3) + 1}.png`,
      },
    });
    remaining -= durationFrames;
    index += 1;
  }
  return parseTimelineContract({
    schemaVersion: 1,
    fps: DEFAULT_FPS,
    width: 1920,
    height: 1080,
    seed: 7,
    locale: 'en',
    themeKey: 'timeless',
    styleManifestVersion: 1,
    watermark: false,
    displayName: 'Duration Fixture',
    scenes,
  });
}

describe('pack-duration-local', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-pack-dur-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('auto-moves selected pack to Life Story when film exceeds 8 minutes', async () => {
    const store = await import('./store');
    const pack = await import('./pack-duration-local');
    const created = await store.createTribute({ displayName: 'Duration Person' });
    await store.updateTribute(created.publicId, {
      selectedConsumerPackId: 'memorial-tribute',
    });
    const saved = await store.saveTimeline(created.publicId, timelineForSeconds(8 * 60 + 15), {
      expectedVersion: 0,
    });
    expect(saved.ok).toBe(true);

    const synced = await pack.syncConsumerPackForFilmDuration(created.publicId);
    expect(synced?.view.recommendation.selectedPlanId).toBe('life-story');
    expect(synced?.view.recommendation.reason).toBe('over_eight_minutes');
    expect(synced?.view.recommendation.autoUpgraded).toBe(true);
    expect(synced?.tribute.selectedConsumerPackId).toBe('life-story');
  });

  it('auto-moves to Forever Legacy when film exceeds 20 minutes', async () => {
    const store = await import('./store');
    const pack = await import('./pack-duration-local');
    const created = await store.createTribute({ displayName: 'Long Film Person' });
    await store.updateTribute(created.publicId, {
      selectedConsumerPackId: 'life-story',
    });
    const saved = await store.saveTimeline(created.publicId, timelineForSeconds(20 * 60 + 5), {
      expectedVersion: 0,
    });
    expect(saved.ok).toBe(true);

    const synced = await pack.syncConsumerPackForFilmDuration(created.publicId);
    expect(synced?.view.recommendation.selectedPlanId).toBe('forever-legacy');
    expect(synced?.view.recommendation.reason).toBe('over_twenty_minutes');
    expect(synced?.tribute.selectedConsumerPackId).toBe('forever-legacy');
  });
});
