import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('music director local (MV-AUD-003)', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-music-dir-'));
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

  it('saves Opening / Memories / Farewell with a song link as reference only', async () => {
    const store = await import('./store');
    const director = await import('./music-director-local');
    const created = await store.createTribute({ displayName: 'Ada Music' });
    const plan = director.resolveMusicDirectorPlan(created);
    const memories = plan.slots.find((slot) => slot.id === 'memories')!;
    memories.song = {
      title: 'Bridge Over Troubled Water',
      artist: 'Simon & Garfunkel',
      linkUrl: 'https://open.spotify.com/track/example',
      linkPlatform: 'spotify',
      catalogTrackKey: null,
      durationMs: null,
      notes: '',
    };
    memories.sourceState = 'song_identified';
    plan.rightsConfirmed = true;

    const saved = await director.saveCreatorMusicDirector(created.publicId, plan);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const loaded = await store.getTribute(created.publicId);
    expect(loaded?.musicDirectorPlan?.slots.find((s) => s.id === 'memories')?.song.linkUrl).toContain(
      'spotify.com',
    );
    expect(loaded?.ceremonyMusicPlan?.slots.tribute.trackKey).toBeNull();
  });

  it('applies catalog Memories song onto the film without mix jargon', async () => {
    const store = await import('./store');
    const director = await import('./music-director-local');
    const created = await store.createTribute({ displayName: 'Ben Film' });
    for (const title of ['Garden walk', 'Kitchen light', 'Sunday drive']) {
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
    if (!stage.ok) return;
    expect(stage.tribute.timeline).toBeTruthy();

    const plan = director.resolveMusicDirectorPlan(stage.tribute);
    const memories = plan.slots.find((slot) => slot.id === 'memories')!;
    memories.song = {
      title: 'Still Water',
      artist: 'MemorialVideo fixtures',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: 'still-water',
      durationMs: 45_000,
      notes: '',
    };
    memories.sourceState = 'audio_available';
    const opening = plan.slots.find((slot) => slot.id === 'opening')!;
    opening.sourceState = 'venue_playback';
    opening.song = {
      title: 'Processional',
      artist: '',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: null,
      durationMs: null,
      notes: 'Organ',
    };
    const farewell = plan.slots.find((slot) => slot.id === 'farewell')!;
    farewell.song = {
      title: 'Gentle Rise',
      artist: 'MemorialVideo fixtures',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: 'gentle-rise',
      durationMs: 45_000,
      notes: '',
    };
    farewell.sourceState = 'audio_available';
    plan.speechPauses = [
      {
        id: 'pause_memories_1',
        afterSlot: 'memories',
        label: 'Family tribute speech',
        waitingNote: 'Hold until resume',
        enabled: true,
      },
    ];
    plan.rightsConfirmed = true;

    const applied = await director.applyCreatorMusicDirector(created.publicId, plan);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.applied).toBe(true);
    expect(applied.clipCount).toBeGreaterThan(0);
    expect(applied.message.toLowerCase()).not.toContain('audiomix');
    expect(applied.message.toLowerCase()).not.toContain('timelinecontract');

    const loaded = await store.getTribute(created.publicId);
    expect(loaded?.musicDirectorPlan?.speechPauses).toHaveLength(1);
    expect(loaded?.musicDirectorPlan?.slots.find((s) => s.id === 'opening')?.sourceState).toBe(
      'venue_playback',
    );
    expect(loaded?.soundtrackTrackId).toBe('still-water');
    expect(loaded?.timeline?.audio?.tracks.some((t) => t.kind === 'music')).toBe(true);
    expect(loaded?.ceremonyMusicPlan?.mode).toBe('moments');
    expect(loaded?.ceremonyMusicPlan?.slots.closing.trackKey).toBe('gentle-rise');
  });
});
