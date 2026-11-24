import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTimelineContract } from '@memorialvideo/contracts';

/**
 * Regression: the Ken Burns zoompan filter used to stretch the FIRST photograph over
 * the whole film, so a "verified" MP4 showed one photo for every scene.
 * This renders a real file and checks that each scene shows its own photograph.
 */
describe('rendered film shows every photograph in its own scene', () => {
  const tributeId = 'mv_0123456789abcdef';
  const photos = [
    { id: 'mem_red', color: 'red', channel: 0 },
    { id: 'mem_green', color: 'lime', channel: 1 },
    { id: 'mem_blue', color: 'blue', channel: 2 },
  ] as const;
  let cwd: string;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mv-render-photos-'));
    cwd = process.cwd();
    process.chdir(root);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.CREATOR_LOCAL_ENCODER = '1';
    process.env.CREATOR_USE_REMOTION = '0';
    const mediaDir = path.join(root, '.data', 'media', tributeId);
    mkdirSync(mediaDir, { recursive: true });
    for (const photo of photos) {
      execFileSync('ffmpeg', [
        '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${photo.color}:s=1200x800`,
        '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', path.join(mediaDir, photo.id),
      ]);
    }
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.CREATOR_LOCAL_ENCODER;
    delete process.env.CREATOR_USE_REMOTION;
  });

  function centrePixel(file: string, seconds: number): [number, number, number] {
    const raw = execFileSync('ffmpeg', [
      '-loglevel', 'error', '-ss', seconds.toFixed(2), '-i', file, '-frames:v', '1',
      '-vf', 'crop=200:200,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]);
    return [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0];
  }

  it('gives each photo exactly its scene and keeps the paid final free of the preview watermark', async () => {
    const encode = await import('./local-encode');
    const sceneFrames = 90;
    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 4023042452,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Regression Person',
      scenes: photos.map((photo) => ({
        id: `image-${photo.id}`,
        type: 'image',
        durationFrames: sceneFrames,
        transitionIn: 'none',
        transitionOut: 'none',
        asset: { assetId: photo.id, src: `/api/media/${tributeId}/${photo.id}` },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      })),
    });

    const out = path.join(root, 'out.mp4');
    const result = await encode.encodeWithFfmpeg({
      timeline,
      outputAbsolute: out,
      tributePublicId: tributeId,
      kind: 'final',
    });
    expect(result.ok).toBe(true);

    const probe = await encode.probeWithFfprobe(out);
    const expectedSeconds = (photos.length * sceneFrames) / 30;
    expect(Math.abs((probe.durationSeconds ?? 0) - expectedSeconds)).toBeLessThan(0.5);

    photos.forEach((photo, index) => {
      const middle = (index * sceneFrames + sceneFrames / 2) / 30;
      const pixel = centrePixel(out, middle);
      const dominant = pixel.indexOf(Math.max(...pixel));
      expect(dominant, `scene ${index + 1} should show the ${photo.color} photograph`).toBe(photo.channel);
    });
  }, 120_000);
});
