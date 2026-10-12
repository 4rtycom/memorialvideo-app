import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator guided variants', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-ov-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.MUSIC_CATALOG_ENABLED = 'true';
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.chdir(cwd);
    try {
      chmodSync(path.join(dataRoot, '.data'), 0o755);
    } catch {
      // ignore
    }
    try {
      chmodSync(dataRoot, 0o755);
    } catch {
      // ignore
    }
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  async function tributeWithTimeline() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Variant Person' });
    for (const title of ['One', 'Two', 'Three']) {
      await store.addMemory(created.publicId, {
        title,
        imagePath: '/fixtures/sample.png',
        alreadyReady: true,
      });
    }
    let stage = await store.advanceFirstFilm(created.publicId);
    for (let i = 0; i < 8 && stage.ok && stage.tribute.firstFilmStage !== 'ready_to_review'; i++) {
      stage = await store.advanceFirstFilm(created.publicId);
    }
    expect(stage.ok).toBe(true);
    return created.publicId;
  }

  it('proposes, previews, applies, and reverts a vertical Guided Variant', async () => {
    const publicId = await tributeWithTimeline();
    const variants = await import('./guided-variants-local');
    const store = await import('./store');

    const before = await store.getTribute(publicId);
    expect(before?.timeline?.width).toBe(1920);
    expect(before?.timeline?.height).toBe(1080);

    const proposed = await variants.proposeGuidedVariant(publicId, {
      kind: 'vertical',
      aspect: '9:16',
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.afterAspect).toBe('9:16');
    expect(proposed.width).toBe(1080);
    expect(proposed.height).toBe(1920);
    expect(proposed.faceAwareReframe.available).toBe(false);

    const preview = await variants.previewGuidedVariant(publicId);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.previewTimeline?.width).toBe(1080);
    expect(preview.previewTimeline?.height).toBe(1920);

    // Preview must not mutate the live timeline.
    const stillBefore = await store.getTribute(publicId);
    expect(stillBefore?.timeline?.width).toBe(1920);

    const applied = await variants.applyGuidedVariant(publicId);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.timeline?.width).toBe(1080);
    expect(applied.timeline?.height).toBe(1920);
    expect(applied.timelineVersion).toBeGreaterThan(0);

    const afterApply = await store.getTribute(publicId);
    expect(afterApply?.timeline?.width).toBe(1080);
    expect(afterApply?.timeline?.height).toBe(1920);
    expect(afterApply?.timelinePrevious).toBeTruthy();

    const overview = await variants.loadGuidedVariantsOverview(afterApply!);
    expect(overview.pending).toBe(false);
    expect(overview.currentAspect).toBe('9:16');
    expect(overview.faceAwareReframe.available).toBe(false);

    const reverted = await variants.revertGuidedVariant(publicId);
    expect(reverted.ok).toBe(true);
    if (!reverted.ok) return;
    expect(reverted.timeline?.width).toBe(1920);
    expect(reverted.timeline?.height).toBe(1080);
  });

  it('rejects apply without propose and stale bases honestly', async () => {
    const publicId = await tributeWithTimeline();
    const variants = await import('./guided-variants-local');
    const store = await import('./store');
    const { parseTimelineContract } = await import('@memorialvideo/contracts');

    const missing = await variants.applyGuidedVariant(publicId);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error).toBe('needs_propose');

    const proposed = await variants.proposeGuidedVariant(publicId, { kind: 'square' });
    expect(proposed.ok).toBe(true);

    const tribute = await store.getTribute(publicId);
    expect(tribute?.timeline).toBeTruthy();
    if (!tribute?.timeline) return;
    // Aspect change alters timeline hash so the pending base is stale.
    const mutated = parseTimelineContract({
      ...tribute.timeline,
      width: 1080,
      height: 1080,
    });
    await store.saveTimeline(publicId, mutated, {
      expectedVersion: tribute.timelineVersion,
      clientUpdatedAt: tribute.updatedAt,
    });

    const stale = await variants.previewGuidedVariant(publicId);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toBe('stale_base');
  });

  it('propose returns persistence_unavailable when local FS becomes read-only', async () => {
    const publicId = await tributeWithTimeline();
    const persistence = await import('./persistence');
    // Lock .data itself so the writable probe fails even though the store file still reads.
    chmodSync(path.join(dataRoot, '.data'), 0o555);
    chmodSync(dataRoot, 0o555);
    process.env.VERCEL = '1';
    persistence.resetPersistenceCacheForTests();

    const variants = await import('./guided-variants-local');
    const result = await variants.proposeGuidedVariant(publicId, { kind: 'vertical' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('persistence_unavailable');
    expect(result.status).toBe(503);
  });
});
