import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spec §12.1 first milestone on synthetic fixtures.
 * This is not a consented production memorial pack and not a live Stripe charge.
 */
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(APP_ROOT, 'public/fixtures/milestone');

function memoryId(n: number): string {
  return `mem_${n.toString(16).padStart(16, '0')}`;
}

describe('first milestone album', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-milestone-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = 'test-session-secret-0123456789';
    process.env.CREATOR_LOCAL_ENCODER = '1';
    process.env.CREATOR_USE_REMOTION = '0';
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.CREATOR_LOCAL_ENCODER;
    delete process.env.CREATOR_USE_REMOTION;
  });

  it(
    'creates an account, drafts 30 photos 5 videos and 2 songs, edits order, and downloads a local 1080p MP4',
    async () => {
      const accounts = await import('./accounts');
      const actor = await import('./actor');
      const store = await import('./store');
      const audio = await import('./guided-audio-local');
      const render = await import('./render');
      const encode = await import('./local-encode');
      const ops = await import('./timeline-ops');
      const { parseTimelineContract } = await import('@memorialvideo/contracts');

      const registered = await accounts.registerAccount('milestone.album@example.com', 'correct horse battery');
      expect(registered.ok).toBe(true);
      if (!registered.ok) return;

      await actor.runWithAccount(registered.accountId, async () => {
        const tribute = await store.createTribute({ displayName: 'Milestone Album' });
        expect(tribute.ownerAccountId).toBe(registered.accountId);

        for (let index = 0; index < 30; index += 1) {
          const added = await store.addMemory(tribute.publicId, {
            id: memoryId(index + 1),
            title: `Photo ${index + 1}`,
            filename: `photo-${index + 1}.png`,
            contentType: 'image/png',
            imagePath: '/fixtures/milestone/photo.png',
            alreadyReady: true,
          });
          expect(added?.ingestStatus).toBe('READY');
        }
        for (let index = 0; index < 5; index += 1) {
          const added = await store.addMemory(tribute.publicId, {
            id: memoryId(40 + index),
            title: `Clip ${index + 1}`,
            filename: `clip-${index + 1}.mp4`,
            contentType: 'video/mp4',
            imagePath: '/fixtures/milestone/clip.mp4',
            durationMs: 400,
            alreadyReady: true,
          });
          expect(added?.ingestStatus).toBe('READY');
        }

        const songA = memoryId(50);
        const songB = memoryId(51);
        const mediaDir = path.join(dataRoot, '.data', 'media', tribute.publicId);
        mkdirSync(mediaDir, { recursive: true });
        copyFileSync(path.join(FIXTURE, 'song-a.wav'), path.join(mediaDir, songA));
        copyFileSync(path.join(FIXTURE, 'song-b.wav'), path.join(mediaDir, songB));
        await store.addMemory(tribute.publicId, {
          id: songA,
          title: 'Opening tone',
          filename: 'song-a.wav',
          contentType: 'audio/wav',
          imagePath: `/api/media/${tribute.publicId}/${songA}`,
          rightsConfirmed: true,
          alreadyReady: true,
        });
        await store.addMemory(tribute.publicId, {
          id: songB,
          title: 'Later tone',
          filename: 'song-b.wav',
          contentType: 'audio/wav',
          imagePath: `/api/media/${tribute.publicId}/${songB}`,
          rightsConfirmed: true,
          alreadyReady: true,
        });

        let stage = '';
        for (let step = 0; step < 8 && stage !== 'ready_to_review'; step += 1) {
          const advanced = await store.advanceFirstFilm(tribute.publicId);
          expect(advanced.ok).toBe(true);
          if (advanced.ok) stage = advanced.stage;
        }
        expect(stage).toBe('ready_to_review');

        const drafted = await store.getTribute(tribute.publicId);
        const timeline = parseTimelineContract(drafted?.timeline);
        const images = timeline.scenes.filter((scene) => scene.type === 'image');
        const videos = timeline.scenes.filter((scene) => scene.type === 'video');
        expect(images).toHaveLength(30);
        expect(videos).toHaveLength(5);
        expect(timeline.scenes.some((scene) => scene.type === 'intro')).toBe(true);

        const firstImage = images[0]!;
        const secondImage = images[1]!;
        const toIndex = timeline.scenes.findIndex((scene) => scene.id === firstImage.id);
        const reordered = ops.applyTimelineOp(timeline, {
          op: 'move_scene',
          sceneId: secondImage.id,
          toIndex,
        });
        const saved = await store.saveTimeline(tribute.publicId, reordered, {
          expectedVersion: drafted!.timelineVersion,
        });
        expect(saved.ok).toBe(true);
        const afterEdit = parseTimelineContract((await store.getTribute(tribute.publicId))?.timeline);
        const editedImages = afterEdit.scenes.filter((scene) => scene.type === 'image');
        expect(editedImages[0]?.id).toBe(secondImage.id);
        expect(editedImages[1]?.id).toBe(firstImage.id);

        const placed = await audio.placePersonalSongs(tribute.publicId, [
          {
            memoryId: songA,
            startFrame: 0,
            durationFrames: 30,
            fadeInFrames: 6,
            fadeOutFrames: 6,
            gainDb: 0,
          },
          {
            memoryId: songB,
            startFrame: 120,
            durationFrames: 30,
            fadeInFrames: 6,
            fadeOutFrames: 6,
            gainDb: -12,
          },
        ]);
        expect(placed.ok).toBe(true);

        const packed = await store.fulfillLocalMemorialPack(tribute.publicId);
        expect(packed.ok).toBe(true);
        if (!packed.ok) return;
        expect(packed.tribute.entitlement?.source).toBe('local_fake');

        const enqueued = await render.enqueueRenderJob(tribute.publicId, 'final');
        expect(enqueued.ok).toBe(true);
        if (!enqueued.ok) return;

        let status = enqueued.job.status;
        let note = '';
        for (let step = 0; step < 8 && status !== 'READY' && status !== 'FAILED_RETRYABLE' && status !== 'FAILED_FINAL'; step += 1) {
          const tick = await render.advanceRenderOnce(tribute.publicId);
          status = tick.advanced?.status ?? status;
          note = tick.note;
        }
        expect(status, note).toBe('READY');

        const finished = await store.getTribute(tribute.publicId);
        const download = render.planDownloadFromJobs(finished);
        expect(download.canDownloadMp4).toBe(true);
        const absolute = await render.resolveReadyFinalAbsolutePath(finished!);
        expect(absolute).toBeTruthy();
        const probe = await encode.probeWithFfprobe(absolute!);
        expect(probe.hasVideo).toBe(true);
        expect(probe.hasAudio).toBe(true);
        expect(probe.width).toBe(1920);
        expect(probe.height).toBe(1080);
        expect((probe.durationSeconds ?? 0) > 10).toBe(true);
      });
    },
    900_000,
  );
});
