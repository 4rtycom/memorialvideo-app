import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { probeWav } from './wav-probe';

export type MixWindowMeasurement = {
  label: string;
  startFrame: number;
  endFrame: number;
  rms: number;
  peak: number;
};

export type MixMeasureResult = {
  ok: boolean;
  windows: MixWindowMeasurement[];
  duckedRms: number | null;
  musicOnlyRms: number | null;
  duckingConfirmed: boolean;
  reason?: string;
};

function resolveFfmpeg(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const candidate = require('ffmpeg-static') as string | null;
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
  } catch {
    // fall through
  }
  return null;
}

function rmsForFrameWindow(
  wav: Uint8Array,
  fps: number,
  startFrame: number,
  endFrame: number,
): { rms: number; peak: number } | null {
  const probe = probeWav(wav);
  if (!probe) {
    return null;
  }
  const startSample = Math.floor((startFrame / fps) * probe.sampleRate) * probe.channels;
  const endSample = Math.floor((endFrame / fps) * probe.sampleRate) * probe.channels;
  const bytesPerSample = probe.bitsPerSample / 8;
  // Re-parse PCM from full wav via probeWav is aggregate; extract window manually.
  if (wav.length < 44) {
    return null;
  }
  let offset = 12;
  let data: Uint8Array | null = null;
  const channels = probe.channels;
  const bitsPerSample = probe.bitsPerSample;
  while (offset + 8 <= wav.length) {
    const type = String.fromCharCode(
      wav[offset] ?? 0,
      wav[offset + 1] ?? 0,
      wav[offset + 2] ?? 0,
      wav[offset + 3] ?? 0,
    );
    const size =
      (wav[offset + 4] ?? 0) |
      ((wav[offset + 5] ?? 0) << 8) |
      ((wav[offset + 6] ?? 0) << 16) |
      ((wav[offset + 7] ?? 0) << 24);
    const start = offset + 8;
    if (type === 'data') {
      data = wav.subarray(start, Math.min(wav.length, start + size));
    }
    offset = start + size + (size % 2);
  }
  if (!data) {
    return null;
  }
  const sampleStart = Math.max(0, startSample) * bytesPerSample;
  const sampleEnd = Math.min(data.length, Math.max(sampleStart + bytesPerSample, endSample * bytesPerSample));
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (let at = sampleStart; at + bytesPerSample <= sampleEnd; at += bytesPerSample) {
    let sample = 0;
    if (bitsPerSample === 16) {
      const raw = (data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);
      sample = (raw > 32767 ? raw - 65536 : raw) / 32768;
    } else {
      sample = ((data[at] ?? 128) - 128) / 128;
    }
    const abs = Math.abs(sample);
    if (abs > peak) {
      peak = abs;
    }
    sumSq += sample * sample;
    count += 1;
  }
  void channels;
  return { rms: count ? Math.sqrt(sumSq / count) : 0, peak };
}

/**
 * Extract AAC from an MP4 to PCM WAV with explicit argv (no shell), then measure RMS windows.
 * When `musicHz` is set, also measure a narrow band around the synthetic music fundamental
 * so ducking can be confirmed even when speech energy dominates the broadband mix.
 */
export function measureMixFromMp4(input: {
  mp4Path: string;
  fps: number;
  windows: ReadonlyArray<{ label: string; startFrame: number; endFrame: number }>;
  duckingRatioMax?: number;
  musicHz?: number;
}): MixMeasureResult {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) {
    return { ok: false, windows: [], duckedRms: null, musicOnlyRms: null, duckingConfirmed: false, reason: 'ffmpeg_missing' };
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-audio-qc-'));
  const wavPath = path.join(dir, 'mix.wav');
  const bandPath = path.join(dir, 'music-band.wav');
  try {
    const result = spawnSync(
      ffmpeg,
      ['-y', '-i', input.mp4Path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      return {
        ok: false,
        windows: [],
        duckedRms: null,
        musicOnlyRms: null,
        duckingConfirmed: false,
        reason: 'ffmpeg_extract_failed',
      };
    }
    const wav = new Uint8Array(readFileSync(wavPath));
    let bandWav: Uint8Array | null = null;
    if (input.musicHz && input.musicHz > 0) {
      const low = Math.max(40, Math.floor(input.musicHz * 0.85));
      const high = Math.min(7000, Math.ceil(input.musicHz * 1.15));
      const band = spawnSync(
        ffmpeg,
        [
          '-y',
          '-i',
          wavPath,
          '-af',
          `highpass=f=${low},lowpass=f=${high}`,
          '-c:a',
          'pcm_s16le',
          bandPath,
        ],
        { windowsHide: true, encoding: 'utf8' },
      );
      if (band.status === 0) {
        bandWav = new Uint8Array(readFileSync(bandPath));
      }
    }
    const measureSource = bandWav ?? wav;
    const windows: MixWindowMeasurement[] = [];
    for (const window of input.windows) {
      const measured = rmsForFrameWindow(measureSource, input.fps, window.startFrame, window.endFrame);
      if (!measured) {
        continue;
      }
      windows.push({
        label: window.label,
        startFrame: window.startFrame,
        endFrame: window.endFrame,
        rms: measured.rms,
        peak: measured.peak,
      });
    }
    const ducked = windows.filter((item) => item.label.startsWith('ducked_'));
    const musicOnly = windows.filter((item) => item.label === 'music_only');
    const duckedRms =
      ducked.length > 0 ? ducked.reduce((sum, item) => sum + item.rms, 0) / ducked.length : null;
    const musicOnlyRms =
      musicOnly.length > 0 ? musicOnly.reduce((sum, item) => sum + item.rms, 0) / musicOnly.length : null;
    const ratioMax = input.duckingRatioMax ?? 0.85;
    const duckingConfirmed =
      duckedRms !== null && musicOnlyRms !== null && musicOnlyRms > 0.001 && duckedRms / musicOnlyRms < ratioMax;
    return {
      ok: windows.length > 0,
      windows,
      duckedRms,
      musicOnlyRms,
      duckingConfirmed,
      reason: duckingConfirmed ? undefined : 'ducking_not_confirmed',
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}

/** Write a short synthetic WAV for fixtures (no private content). */
export function writeSyntheticToneWav(filePath: string, durationMs: number, hz: number, amplitude = 0.35): void {
  const sampleRate = 16000;
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * hz * index) / sampleRate) * amplitude;
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
}
