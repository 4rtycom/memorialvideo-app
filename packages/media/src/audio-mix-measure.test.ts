import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { measureMixFromMp4, writeSyntheticToneWav } from './audio-mix-measure';

describe('audio mix measure', () => {
  it('writes synthetic tone wav fixtures', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mv-tone-'));
    const file = path.join(dir, 'tone.wav');
    writeSyntheticToneWav(file, 500, 440);
    expect(readFileSync(file).length).toBeGreaterThan(1000);
  });

  it('returns a structured failure for a missing mp4', () => {
    const result = measureMixFromMp4({
      mp4Path: path.join(tmpdir(), 'missing-audio-qc.mp4'),
      fps: 30,
      windows: [{ label: 'music_only', startFrame: 0, endFrame: 30 }],
    });
    expect(result.duckingConfirmed).toBe(false);
    expect(result.ok).toBe(false);
  });
});
