import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseFfmpegDurationMs,
  planVideoSampleTimestamps,
  sampleVideoFramesForPeople,
  videoSampleFfmpegAvailable,
} from './video-frame-sample';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-utils/fixtures/people-intelligence',
);

describe('video frame sample', () => {
  it('parses ffmpeg duration lines', () => {
    expect(parseFfmpegDurationMs('Duration: 00:00:04.00, start: 0.000000')).toBe(4000);
    expect(parseFfmpegDurationMs('no duration here')).toBeNull();
  });

  it('plans sample timestamps without inventing out-of-range times', () => {
    const stamps = planVideoSampleTimestamps({ durationMs: 20_000, maxFrames: 4 });
    expect(stamps[0]).toBeGreaterThanOrEqual(2000);
    expect(stamps.at(-1)).toBeLessThanOrEqual(18_000);
  });

  it('samples JPEG frames from a synthetic people clip when ffmpeg is available', async () => {
    const available = await videoSampleFfmpegAvailable();
    if (!available) {
      expect(available).toBe(false);
      return;
    }
    const clipPath = path.join(fixtureDir, 'person-a-clip.mp4');
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(clipPath));
    } catch {
      expect('fixture_missing').toBe('generate with fixtures:people');
      return;
    }
    const result = await sampleVideoFramesForPeople({
      bytes,
      mimeHint: 'video/mp4',
      maxFrames: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames[0]!.jpegBytes[0]).toBe(0xff);
    expect(result.frames[0]!.jpegBytes[1]).toBe(0xd8);
  });
});
