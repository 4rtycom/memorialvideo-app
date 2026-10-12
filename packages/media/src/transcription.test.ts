import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ffmpegAvailable, normalizeAudioForTranscription } from './audio-normalize';
import { classifyPcmSpeechLikelihood, runLocalTranscription } from './transcription';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-utils/fixtures/content-extraction',
);

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(fixtureDir, name)));
}

describe('audio normalize and transcription safety', () => {
  it('classifies silence and tones without calling them speech', () => {
    const silence = new Float32Array(1600);
    expect(classifyPcmSpeechLikelihood(silence).kind).toBe('silence');

    const tone = new Float32Array(8000);
    for (let index = 0; index < tone.length; index += 1) {
      tone[index] = Math.sin((2 * Math.PI * 440 * index) / 16_000) * 0.4;
    }
    expect(classifyPcmSpeechLikelihood(tone).kind).toBe('tone_or_music');
  });

  it('rejects corrupt bytes as unsupported without inventing text', async () => {
    const result = await runLocalTranscription({
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      cacheDir: path.resolve(fixtureDir, '../../../.cache/transformers-test'),
    });
    expect(result.fullText).toBe('');
    expect(result.partial).toBe(true);
    expect(result.warnings.some((w) => w.includes('unsupported') || w.includes('normalize') || w.includes('silent'))).toBe(
      true,
    );
  });

  it('normalizes MP3 to PCM when ffmpeg and spoken.mp3 fixtures exist', async () => {
    const available = await ffmpegAvailable();
    let mp3: Uint8Array;
    try {
      mp3 = readFixture('spoken.mp3');
    } catch {
      return;
    }
    if (!available || mp3.length < 100) {
      return;
    }
    const result = await normalizeAudioForTranscription({
      bytes: mp3,
      mimeHint: 'audio/mpeg',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe(true);
      expect(result.wavBytes[0]).toBe(0x52);
      expect(result.wavBytes[8]).toBe(0x57);
    }
  });
});
