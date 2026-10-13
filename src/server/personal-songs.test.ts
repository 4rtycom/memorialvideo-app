import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function meanVolume(file: string, start: number, duration: number): number {
  const probe = spawnSync(
    'ffmpeg',
    ['-ss', String(start), '-t', String(duration), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const match = probe.stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) {
    throw new Error(probe.stderr.slice(-400));
  }
  return Number(match[1]);
}

describe('two personal songs', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-songs-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_LOCAL_ENCODER = '1';
    process.env.CREATOR_USE_REMOTION = '0';
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('places two songs in different sections and the render follows gain', async () => {
    const store = await import('./store');
    const audio = await import('./guided-audio-local');
    const encode = await import('./local-encode');
    const { totalDurationFrames } = await import('@memorialvideo/contracts');

    const tribute = await store.createTribute({ displayName: 'Song Film' });
    const photos = [];
    for (let index = 0; index < 3; index += 1) {
      photos.push(
        await store.addMemory(tribute.publicId, {
          title: `Photo ${index + 1}`,
          filename: `photo-${index + 1}.jpg`,
          imagePath: '/fixtures/memory-a.png',
          contentType: 'image/jpeg',
          alreadyReady: true,
        }),
      );
    }
    expect(photos.every(Boolean)).toBe(true);

    const hymn = await store.addMemory(tribute.publicId, {
      id: 'mem_aaaaaaaaaaaaaaaa',
      title: 'Opening hymn',
      filename: 'opening.wav',
      contentType: 'audio/wav',
      imagePath: `/api/media/${tribute.publicId}/mem_aaaaaaaaaaaaaaaa`,
      rightsConfirmed: true,
      alreadyReady: true,
    });
    const waltz = await store.addMemory(tribute.publicId, {
      id: 'mem_bbbbbbbbbbbbbbbb',
      title: 'Later waltz',
      filename: 'later.wav',
      contentType: 'audio/wav',
      imagePath: `/api/media/${tribute.publicId}/mem_bbbbbbbbbbbbbbbb`,
      rightsConfirmed: true,
      alreadyReady: true,
    });
    const spoken = await store.addMemory(tribute.publicId, {
      id: 'mem_cccccccccccccccc',
      title: 'A few words',
      filename: 'words.mp4',
      contentType: 'video/mp4',
      imagePath: `/api/media/${tribute.publicId}/mem_cccccccccccccccc`,
      durationMs: 500,
      alreadyReady: true,
    });
    expect(hymn && waltz && spoken).toBeTruthy();

    const mediaDir = path.join(dataRoot, '.data', 'media', tribute.publicId);
    mkdirSync(mediaDir, { recursive: true });
    const hymnPath = path.join(mediaDir, 'mem_aaaaaaaaaaaaaaaa');
    const waltzPath = path.join(mediaDir, 'mem_bbbbbbbbbbbbbbbb');
    const videoPath = path.join(mediaDir, 'mem_cccccccccccccccc');
    expect(
      spawnSync(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'pcm_s16le', '-f', 'wav', hymnPath],
        { encoding: 'utf8' },
      )
        .status,
    ).toBe(0);
    expect(
      spawnSync(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:a', 'pcm_s16le', '-f', 'wav', waltzPath],
        { encoding: 'utf8' },
      )
        .status,
    ).toBe(0);
    expect(
      spawnSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=64x64:d=0.5',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=1000:duration=0.5',
          '-shortest',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-f',
          'mp4',
          videoPath,
        ],
        { encoding: 'utf8' },
      ).status,
    ).toBe(0);

    let stage = '';
    for (let step = 0; step < 6 && stage !== 'ready_to_review'; step += 1) {
      const advanced = await store.advanceFirstFilm(tribute.publicId);
      expect(advanced.ok).toBe(true);
      if (advanced.ok) stage = advanced.stage;
    }
    expect(stage).toBe('ready_to_review');

    const denied = await audio.placePersonalSongs(tribute.publicId, [
      {
        memoryId: 'mem_aaaaaaaaaaaaaaaa',
        startFrame: 0,
        durationFrames: 30,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        gainDb: 0,
      },
      {
        memoryId: 'mem_bbbbbbbbbbbbbbbb',
        startFrame: 0,
        durationFrames: 30,
        fadeInFrames: 6,
        fadeOutFrames: 6,
        gainDb: -6,
      },
    ]);
    expect(denied).toEqual({ ok: false, error: 'same_section', status: 400 });

    const placed = await audio.placePersonalSongs(tribute.publicId, [
      {
        memoryId: 'mem_aaaaaaaaaaaaaaaa',
        startFrame: 0,
        durationFrames: 45,
        fadeInFrames: 12,
        fadeOutFrames: 12,
        gainDb: 0,
      },
      {
        memoryId: 'mem_bbbbbbbbbbbbbbbb',
        startFrame: 90,
        durationFrames: 45,
        fadeInFrames: 15,
        fadeOutFrames: 15,
        gainDb: -18,
      },
    ]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.duckingRegions).toBeGreaterThan(0);
    const saved = await store.getTribute(tribute.publicId);
    const total = totalDurationFrames(saved!.timeline!);
    expect(total).toBeGreaterThan(135);
    const clips = await encode.resolveTimelineMusicClips(saved!.timeline!, tribute.publicId);
    expect(clips.map((clip) => clip.startFrame)).toEqual([0, 90]);
    expect(clips[0]?.fadeInFrames).toBe(12);
    expect(clips[1]?.gainDb).toBe(-18);

    const output = path.join(dataRoot, 'song-film.mp4');
    const encoded = await encode.encodeWithFfmpeg({
      timeline: saved!.timeline!,
      outputAbsolute: output,
      tributePublicId: tribute.publicId,
      kind: 'preview',
    });
    if (!encoded.ok) {
      throw new Error(encoded.reason);
    }
    const opening = meanVolume(output, 0.2, 0.8);
    const later = meanVolume(output, 3.2, 0.8);
    expect(opening).toBeGreaterThan(later + 8);
  }, 90_000);
});
