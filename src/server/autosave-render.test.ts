import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTimelineContract } from '@memorialvideo/contracts';

describe('creator autosave conflict + render QC honesty', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-asr-'));
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

  async function arrangedTribute() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Autosave Person' });
    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD; i += 1) {
      await store.addMemory(created.publicId, {
        title: `M${i}`,
        filename: `m${i}.jpg`,
        alreadyReady: true,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const step = await store.advanceFirstFilm(created.publicId);
      if (step.ok && step.stage === 'ready_to_review') break;
    }
    return store.getTribute(created.publicId);
  }

  it('rejects missing revision and stale expectedVersion without overwrite', async () => {
    const store = await import('./store');
    const ops = await import('./timeline-ops');
    const tribute = await arrangedTribute();
    expect(tribute?.timeline).toBeTruthy();
    const timeline = parseTimelineContract(tribute!.timeline!);
    const missing = await store.saveTimeline(tribute!.publicId, timeline, {});
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toBe('missing_revision');

    const edited = ops.applyTimelineOp(timeline, {
      op: 'set_caption',
      sceneId: timeline.scenes.find((s) => s.type === 'image')!.id,
      caption: 'First save',
    });
    const saved = await store.saveTimeline(tribute!.publicId, edited, {
      expectedVersion: tribute!.timelineVersion,
      clientUpdatedAt: tribute!.updatedAt,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const stale = await store.saveTimeline(tribute!.publicId, timeline, {
      expectedVersion: tribute!.timelineVersion,
      clientUpdatedAt: tribute!.updatedAt,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reason).toBe('conflict');
    const reloaded = await store.getTribute(tribute!.publicId);
    const caption = reloaded?.timeline
      ? parseTimelineContract(reloaded.timeline).scenes.find((s) => s.type === 'image')?.caption
      : null;
    expect(caption).toBe('First save');
  });

  it('never marks render READY without Output QC on a real MP4', async () => {
    const store = await import('./store');
    const render = await import('./render');
    const tribute = await arrangedTribute();
    await store.fulfillLocalMemorialPack(tribute!.publicId);

    const enqueued = await render.enqueueRenderJob(tribute!.publicId, 'final');
    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;
    expect(enqueued.job.status).toBe('QUEUED');

    let status = enqueued.job.status;
    for (let i = 0; i < 6 && status !== 'FAILED_RETRYABLE' && status !== 'READY'; i += 1) {
      const step = await render.advanceRenderOnce(tribute!.publicId);
      status = step.advanced?.status ?? status;
    }
    expect(status).toBe('FAILED_RETRYABLE');
    const reloaded = await store.getTribute(tribute!.publicId);
    const job = reloaded!.renderJobs[0]!;
    expect(job.outputVerified).toBe(false);
    expect(job.qcFailures.length).toBeGreaterThan(0);
    const download = render.planDownloadFromJobs(reloaded);
    expect(download.canDownloadMp4).toBe(false);
  });

  it('persists members, activity, and ceremony checklist', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Collab Person' });
    expect(created.members.some((m) => m.role === 'owner')).toBe(true);
    expect(created.activity.some((a) => a.code === 'tribute_created')).toBe(true);

    const member = await store.addMember(created.publicId, { label: 'Aunt May', role: 'viewer' });
    expect(member?.status).toBe('invited');
    const checklist = await store.updateCeremonyChecklist(created.publicId, {
      downloadDevice: true,
      testVenue: true,
    });
    expect(checklist?.ceremonyChecklist.downloadDevice).toBe(true);
    expect(checklist?.ceremonyChecklist.testVenue).toBe(true);
    expect(checklist?.activity.some((a) => a.code === 'checklist_updated')).toBe(true);
    expect(checklist?.activity.some((a) => a.code === 'member_added')).toBe(true);
  });
});
