import { mkdtempSync, rmSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator enhance → film bind + encode-safe resolve', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-enh-film-'));
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

  async function tributeWithReadyFilm() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Enhance Film Person' });
    const memory = await store.addMemory(created.publicId, {
      title: 'Portrait',
      filename: 'p.jpg',
      alreadyReady: true,
      imagePath: '/fixtures/memory-a.png',
    });
    // First-film threshold needs enough READY photos.
    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD - 1; i += 1) {
      await store.addMemory(created.publicId, {
        title: `Extra ${i}`,
        filename: `e${i}.jpg`,
        alreadyReady: true,
        imagePath: '/fixtures/memory-b.png',
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const step = await store.advanceFirstFilm(created.publicId);
      if (step.ok && step.tribute.firstFilmStage === 'ready_to_review') break;
    }
    const tribute = await store.getTribute(created.publicId);
    expect(tribute?.timeline).toBeTruthy();
    return { publicId: created.publicId, memoryId: memory!.id };
  }

  it(
    'approves a ready_local variant into TimelineContract with encode-safe src',
    async () => {
      const { publicId, memoryId } = await tributeWithReadyFilm();
      const store = await import('./store');
      const encode = await import('./local-encode');

      await store.updateTribute(publicId, { enhancementConsentLocal: true });
      const requested = await store.requestLocalEnhancement(publicId, memoryId);
      expect(requested.ok).toBe(true);
      if (!requested.ok) return;

      await store.advanceEnhancementOnce(publicId);
      const second = await store.advanceEnhancementOnce(publicId);
      expect(second.advanced?.status).toBe('ready_local');
      expect(second.advanced?.variantPath).toBeTruthy();
      if (second.advanced?.status !== 'ready_local' || !second.advanced.variantPath) return;

      const before = await store.getTribute(publicId);
      const beforeVersion = before?.timelineVersion ?? 0;
      const beforeScene = before?.timeline?.scenes.find(
        (s) => (s.type === 'image' || s.type === 'video') && s.asset.assetId === memoryId,
      );
      expect(beforeScene && (beforeScene.type === 'image' || beforeScene.type === 'video')).toBe(
        true,
      );
      if (!beforeScene || (beforeScene.type !== 'image' && beforeScene.type !== 'video')) return;
      expect(beforeScene.asset.src).toBe('/fixtures/memory-a.png');
      expect(beforeScene.asset.enhancementVariantId).toBeUndefined();

      const applied = await store.applyEnhancementToFilm(publicId, second.advanced.id);
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(applied.scenesUpdated).toBeGreaterThanOrEqual(1);
      expect(applied.filmSrc).toBe(encode.enhancementVariantPublicPath(second.advanced.id));
      expect(applied.request.approvedForFilm).toBe(true);
      expect(applied.request.note).toContain('not COMPLETE');

      const after = await store.getTribute(publicId);
      expect(after?.timelineVersion).toBe(beforeVersion + 1);
      const bound = after?.timeline?.scenes.find(
        (s) => (s.type === 'image' || s.type === 'video') && s.asset.assetId === memoryId,
      );
      expect(bound && (bound.type === 'image' || bound.type === 'video')).toBe(true);
      if (!bound || (bound.type !== 'image' && bound.type !== 'video')) return;
      expect(bound.asset.src).toBe(`/api/enhancement/variant/${second.advanced.id}`);
      expect(bound.asset.enhancementVariantId).toBe(second.advanced.id);
      // Original memory path unchanged.
      const memory = after?.memories.find((m) => m.id === memoryId);
      expect(memory?.imagePath).toBe('/fixtures/memory-a.png');

      const resolved = await encode.resolveTimelineAssetPath(bound.asset.src, publicId);
      expect(resolved).toBeTruthy();
      expect(resolved).toContain(path.join('.data', 'enhancements', publicId));
      await access(resolved!);
    },
    60_000,
  );

  it('resolves enhancement public + relative paths for encode without store lookup', async () => {
    const encode = await import('./local-encode');
    const tributeId = 'mv_abcdef0123456789';
    const requestId = 'enh_testhash12';
    const relative = path.join('.data', 'enhancements', tributeId, `${requestId}.jpg`);
    const absolute = path.join(dataRoot, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    // Minimal JPEG SOI/EOI — encoder only needs the file to exist for resolve.
    await writeFile(absolute, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const fromApi = await encode.resolveTimelineAssetPath(
      encode.enhancementVariantPublicPath(requestId),
      tributeId,
    );
    expect(fromApi).toBe(absolute);

    const wrongTribute = await encode.resolveTimelineAssetPath(
      encode.enhancementVariantPublicPath(requestId),
      'mv_0000000000000000',
    );
    expect(wrongTribute).toBeNull();

    const noTribute = await encode.resolveTimelineAssetPath(
      encode.enhancementVariantPublicPath(requestId),
    );
    expect(noTribute).toBeNull();

    const fromRelative = await encode.resolveTimelineAssetPath(relative, tributeId);
    expect(fromRelative).toBe(absolute);

    // Media + fixtures still resolve as before.
    const fixture = await encode.resolveTimelineAssetPath('/fixtures/memory-a.png');
    // Fixtures live under CREATOR_ROOT, not the tmp cwd — may or may not exist depending on checkout.
    // Presence is optional here; just ensure enhancement path did not break the fixture branch.
    expect(fixture === null || fixture.includes('fixtures')).toBe(true);
  });

  it('refuses use_in_film when not ready or timeline lacks the asset', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'No Film Yet' });
    const memory = await store.addMemory(created.publicId, {
      title: 'Solo',
      alreadyReady: true,
      imagePath: '/fixtures/memory-a.png',
    });
    await store.updateTribute(created.publicId, { enhancementConsentLocal: true });
    const requested = await store.requestLocalEnhancement(created.publicId, memory!.id);
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;

    const notReady = await store.applyEnhancementToFilm(created.publicId, requested.request.id);
    expect(notReady).toEqual({ ok: false, reason: 'not_ready' });

    // Force a fake ready_local without bytes / timeline.
    const forced = await store.advanceEnhancementOnce(created.publicId);
    expect(forced.advanced?.status).toBe('processing');
    const stillNoTimeline = await store.applyEnhancementToFilm(
      created.publicId,
      requested.request.id,
    );
    expect(stillNoTimeline.ok).toBe(false);
    if (stillNoTimeline.ok) return;
    expect(['not_ready', 'no_timeline', 'variant_missing']).toContain(stillNoTimeline.reason);
  });
});
