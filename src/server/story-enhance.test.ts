import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator story chapters + enhancement honesty', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-se-'));
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

  it('derives chapters from supplied years without inventing facts', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Story Person' });
    await store.addMemory(created.publicId, {
      title: 'Early',
      year: '1955',
      filename: 'a.jpg',
      alreadyReady: true,
    });
    await store.addMemory(created.publicId, {
      title: 'Later',
      year: '2001',
      filename: 'b.jpg',
      alreadyReady: true,
    });
    const ensured = await store.ensureStoryChapters(created.publicId);
    expect(ensured?.storyChapters.length).toBeGreaterThan(0);
    expect(ensured?.storyChapters.every((c) => c.memoryIds.length > 0)).toBe(true);
    const again = await store.ensureStoryChapters(created.publicId);
    expect(again?.storyChapters).toEqual(ensured?.storyChapters);
  });

  it(
    'requires consent and never invents generative enhancement success',
    async () => {
      // Keep store under tmpdir, but pixel-ops resolves /fixtures via CREATOR_ROOT.
      const store = await import('./store');
      const created = await store.createTribute({ displayName: 'Enhance Person' });
      const memory = await store.addMemory(created.publicId, {
        title: 'Photo',
        filename: 'p.jpg',
        alreadyReady: true,
        imagePath: '/fixtures/memory-a.png',
      });
      const denied = await store.requestLocalEnhancement(created.publicId, memory!.id);
      expect(denied).toEqual({ ok: false, reason: 'no_consent' });

      await store.updateTribute(created.publicId, { enhancementConsentLocal: true });
      const requested = await store.requestLocalEnhancement(created.publicId, memory!.id);
      expect(requested.ok).toBe(true);
      if (!requested.ok) return;

      await store.advanceEnhancementOnce(created.publicId);
      const second = await store.advanceEnhancementOnce(created.publicId);
      expect(['ready_local', 'unavailable']).toContain(second.advanced?.status);
      expect(second.note).toContain('not COMPLETE');
      if (second.advanced?.status === 'ready_local') {
        expect(second.advanced.variantPath).toBeTruthy();
      }
    },
    30_000,
  );

  it('persists soundtrack selection and theme', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Music Person' });
    const updated = await store.updateTribute(created.publicId, {
      soundtrackTrackId: 'still-water',
      musicRightsConfirmed: true,
      themeKey: 'warm_light',
      openingTitle: 'In loving memory',
    });
    expect(updated?.soundtrackTrackId).toBe('still-water');
    expect(updated?.musicRightsConfirmed).toBe(true);
    expect(updated?.themeKey).toBe('warm_light');
    expect(updated?.openingTitle).toBe('In loving memory');

    const aliased = await store.updateTribute(created.publicId, {
      themeKey: 'joyful' as 'warm_light',
    });
    expect(aliased?.themeKey).toBe('warm_light');
  });
});
