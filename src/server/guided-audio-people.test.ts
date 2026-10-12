import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator guided audio + people intel', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-gap-'));
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

  async function tributeWithTimeline() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Gap Lift Person' });
    await store.updateTribute(created.publicId, {
      soundtrackTrackId: 'still-water',
      musicRightsConfirmed: true,
    });
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

  it('proposes, previews, and applies Guided Audio without TTS', async () => {
    const publicId = await tributeWithTimeline();
    const audio = await import('./guided-audio-local');
    const proposed = await audio.proposeGuidedAudio(publicId);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.tts.available).toBe(false);
    expect(proposed.tts.status).toBe('blocked_xb009');

    const preview = await audio.previewGuidedAudio(publicId);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.previewTimeline?.audio?.tracks.some((t) => t.kind === 'music')).toBe(true);

    const applied = await audio.applyGuidedAudio(publicId);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.timelineVersion).toBeGreaterThan(0);

    const store = await import('./store');
    const tribute = await store.getTribute(publicId);
    expect(tribute?.guidedAudioPending).toBeNull();
    expect(tribute?.timeline?.audio?.tracks.some((t) => t.kind === 'music')).toBe(true);
    expect(tribute?.timeline?.audio?.ttsProvider.status).toBe('blocked_xb009');
  });

  it('grants people consent and stores manual labels without claiming detection COMPLETE', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'People Consent' });
    const overview = store.peopleIntelOverview(created);
    expect(overview.processingAllowed).toBe(false);
    expect(overview.detectionEngine.available).toBe(false);
    expect(overview.detectionEngine.note).toContain('not COMPLETE');

    const denied = await store.upsertPeopleProfile(created.publicId, {
      displayLabel: 'Aunt',
    });
    expect(denied.ok).toBe(false);

    const granted = await store.updatePeopleConsent(created.publicId, 'grant_local', 0);
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.overview.processingAllowed).toBe(true);

    const labeled = await store.upsertPeopleProfile(created.publicId, {
      displayLabel: 'Aunt Maria',
      approvedForStory: true,
    });
    expect(labeled.ok).toBe(true);
    if (!labeled.ok) return;
    expect(labeled.overview.profiles[0]?.displayLabel).toBe('Aunt Maria');
    expect(labeled.overview.clusters).toHaveLength(0);
    expect(labeled.overview.observations).toHaveLength(0);
  });
});
