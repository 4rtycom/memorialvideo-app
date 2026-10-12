import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashTimeline } from '@memorialvideo/domain';
import { parseTimelineContract } from '@memorialvideo/contracts';

describe('Prompt 17 stale-final honesty', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-stale-'));
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

  async function tributeWithPublishedTimeline() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Stale Person' });
    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD; i += 1) {
      await store.addMemory(created.publicId, {
        title: `M${i}`,
        filename: `m${i}.jpg`,
        alreadyReady: true,
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const step = await store.advanceFirstFilm(created.publicId);
      if (step.ok && step.stage === 'ready_to_review') break;
    }
    await store.fulfillLocalMemorialPack(created.publicId);
    const tribute = await store.getTribute(created.publicId);
    expect(tribute?.timeline).toBeTruthy();
    return tribute!;
  }

  it('marks READY final current, then stale after TimelineContract edits', async () => {
    const store = await import('./store');
    const render = await import('./render');
    const tribute = await tributeWithPublishedTimeline();
    const timeline = parseTimelineContract(tribute.timeline!);
    const snapshotHash = hashTimeline(timeline);
    const now = new Date().toISOString();

    await store.replaceRenderJobs(tribute.publicId, [
      {
        id: 'rjob_stale_final_test',
        kind: 'final',
        status: 'READY',
        snapshotHash,
        timelineVersion: tribute.timelineVersion,
        attemptCount: 1,
        queuedAt: now,
        updatedAt: now,
        lastHeartbeatAt: now,
        qcFailures: [],
        outputPath: '.data/renders/rjob_stale_final_test.mp4',
        posterPath: null,
        outputVerified: true,
        failureReason: null,
      },
    ]);

    const current = await store.getTribute(tribute.publicId);
    const downloadCurrent = render.planDownloadFromJobs(current);
    expect(downloadCurrent.canDownloadMp4).toBe(true);
    expect(downloadCurrent.staleFinal).toBe(false);
    expect(downloadCurrent.isCurrent).toBe(true);
    expect(render.summarizeRenderJobs(current!)[0]?.isCurrent).toBe(true);

    const edited = {
      ...timeline,
      scenes: timeline.scenes.map((scene) =>
        scene.type === 'image'
          ? { ...scene, durationFrames: Math.min(240, scene.durationFrames + 30) }
          : scene,
      ),
    };
    const saved = await store.saveTimeline(tribute.publicId, edited, {
      expectedVersion: current!.timelineVersion,
    });
    expect(saved.ok).toBe(true);

    const after = await store.getTribute(tribute.publicId);
    const downloadStale = render.planDownloadFromJobs(after);
    expect(downloadStale.canDownloadMp4).toBe(true);
    expect(downloadStale.staleFinal).toBe(true);
    expect(downloadStale.isCurrent).toBe(false);
    expect(downloadStale.reason).toMatch(/Film changed/i);
    expect(render.summarizeRenderJobs(after!)[0]?.isCurrent).toBe(false);
  });
});
