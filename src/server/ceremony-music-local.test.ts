import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator ceremony music AudioMix', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-cm-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.MUSIC_CATALOG_ENABLED = 'true';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('applies AudioMixContract onto a published TimelineContract', async () => {
    const store = await import('./store');
    const music = await import('./ceremony-music-local');
    const created = await store.createTribute({ displayName: 'Music Mix Person' });
    await store.updateTribute(created.publicId, {
      soundtrackTrackId: 'still-water',
      musicRightsConfirmed: true,
    });
    for (const title of ['Garden walk', 'Kitchen light', 'Sunday drive']) {
      await store.addMemory(created.publicId, {
        title,
        imagePath: '/fixtures/sample.png',
        alreadyReady: true,
      });
    }
    // Drive first-film stages to ready_to_review so a TimelineContract exists.
    let stage = await store.advanceFirstFilm(created.publicId);
    for (let i = 0; i < 8 && stage.ok && stage.tribute.firstFilmStage !== 'ready_to_review'; i++) {
      stage = await store.advanceFirstFilm(created.publicId);
    }
    expect(stage.ok).toBe(true);
    if (!stage.ok) return;
    expect(stage.tribute.timeline).toBeTruthy();

    const plan = music.planFromSoundtrack('still-water');
    const applied = await music.applyCreatorCeremonyMusic(created.publicId, plan);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.clipCount).toBeGreaterThan(0);
    expect(applied.licenseStatuses).toContain('development_only');

    const loaded = await store.getTribute(created.publicId);
    expect(loaded?.ceremonyMusicPlan?.slots.tribute.trackKey).toBe('still-water');
    expect(loaded?.timeline?.audio?.tracks.some((t) => t.kind === 'music')).toBe(true);
    expect(loaded?.musicRightsConfirmed).toBe(true);
  });

  it('preview requires a TimelineContract', async () => {
    const store = await import('./store');
    const music = await import('./ceremony-music-local');
    const created = await store.createTribute({ displayName: 'No Timeline Yet' });
    const preview = await music.previewCreatorCeremonyMusic(
      created.publicId,
      music.planFromSoundtrack('warm-room'),
    );
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.error).toBe('needs_timeline');
  });
});
