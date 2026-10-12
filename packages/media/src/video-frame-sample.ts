import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { sniffMime } from './sniff';

const require = createRequire(import.meta.url);

export const VIDEO_SAMPLE_MAX_INPUT_BYTES = 200 * 1024 * 1024;
export const VIDEO_SAMPLE_MAX_FRAMES = 12;

export type SampledVideoFrame = {
  index: number;
  timestampMs: number;
  jpegBytes: Uint8Array;
};

export type VideoFrameSampleResult =
  | {
      ok: true;
      frames: SampledVideoFrame[];
      durationMs: number | null;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'ffmpeg_unavailable' | 'unsupported_input' | 'too_large' | 'sample_failed' | 'empty_output';
      warnings: string[];
    };

function resolveFfmpegPath(): string | null {
  try {
    const candidate = require('ffmpeg-static') as string | null;
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
  } catch {
    // optional
  }
  return process.env.FFMPEG_PATH?.trim() || null;
}

export async function videoSampleFfmpegAvailable(): Promise<boolean> {
  const bin = resolveFfmpegPath();
  if (!bin) {
    return false;
  }
  try {
    await access(bin);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', () => resolve({ code: 1, stderr }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

/** Parse `Duration: HH:MM:SS.xx` from ffmpeg stderr. */
export function parseFfmpegDurationMs(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((value) => Number.isFinite(value))) {
    return null;
  }
  return Math.max(0, Math.round((hours * 3600 + minutes * 60 + seconds) * 1000));
}

/**
 * Evenly spaced sample times across the middle of the clip (skip open/close titles).
 * Pure planner — used by media and domain tests.
 */
export function planVideoSampleTimestamps(input: {
  durationMs: number;
  maxFrames?: number;
}): number[] {
  const durationMs = Math.max(0, Math.floor(input.durationMs));
  const byDuration = durationMs <= 0 ? 1 : Math.max(1, Math.floor(durationMs / 1000));
  const maxFrames = Math.max(
    1,
    Math.min(VIDEO_SAMPLE_MAX_FRAMES, input.maxFrames ?? VIDEO_SAMPLE_MAX_FRAMES, byDuration),
  );
  if (durationMs <= 0) {
    return [0];
  }
  if (durationMs < 1500) {
    return [Math.floor(durationMs / 2)];
  }
  const start = Math.floor(durationMs * 0.1);
  const end = Math.max(start + 1, Math.floor(durationMs * 0.9));
  const span = end - start;
  if (maxFrames === 1) {
    return [Math.floor(start + span / 2)];
  }
  const stamps: number[] = [];
  for (let index = 0; index < maxFrames; index += 1) {
    const t = start + Math.floor((span * index) / (maxFrames - 1));
    stamps.push(Math.min(durationMs - 1, Math.max(0, t)));
  }
  return [...new Set(stamps)].sort((a, b) => a - b);
}

export async function sampleVideoFramesForPeople(input: {
  bytes: Uint8Array;
  mimeHint?: string;
  maxFrames?: number;
  timestampsMs?: readonly number[];
}): Promise<VideoFrameSampleResult> {
  const warnings: string[] = [];
  if (input.bytes.byteLength > VIDEO_SAMPLE_MAX_INPUT_BYTES) {
    return { ok: false, reason: 'too_large', warnings: ['input_too_large'] };
  }
  const sniffed = sniffMime(input.bytes);
  const hint = (input.mimeHint ?? '').toLowerCase();
  const isMp4 =
    sniffed === 'video/mp4' ||
    hint.includes('mp4') ||
    hint.includes('quicktime') ||
    hint.includes('mov');
  if (!isMp4) {
    return { ok: false, reason: 'unsupported_input', warnings: ['unsupported_video_mime'] };
  }

  const bin = resolveFfmpegPath();
  if (!bin) {
    return { ok: false, reason: 'ffmpeg_unavailable', warnings: ['ffmpeg_unavailable'] };
  }
  try {
    await access(bin);
  } catch {
    return { ok: false, reason: 'ffmpeg_unavailable', warnings: ['ffmpeg_unavailable'] };
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'mv-people-frames-'));
  const inputPath = path.join(workDir, 'input.mp4');
  try {
    await writeFile(inputPath, input.bytes);
    const probe = await runFfmpeg(bin, ['-hide_banner', '-i', inputPath]);
    const durationMs = parseFfmpegDurationMs(probe.stderr);
    const timestamps =
      input.timestampsMs && input.timestampsMs.length > 0
        ? [...input.timestampsMs]
        : planVideoSampleTimestamps({
            durationMs: durationMs ?? 8_000,
            maxFrames: input.maxFrames ?? VIDEO_SAMPLE_MAX_FRAMES,
          });

    const frames: SampledVideoFrame[] = [];
    for (const [index, timestampMs] of timestamps.entries()) {
      const outPath = path.join(workDir, `frame_${index}.jpg`);
      const seekSec = (timestampMs / 1000).toFixed(3);
      const extracted = await runFfmpeg(bin, [
        '-hide_banner',
        '-y',
        '-ss',
        seekSec,
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        outPath,
      ]);
      if (extracted.code !== 0) {
        warnings.push(`frame_extract_failed_${index}`);
        continue;
      }
      try {
        const jpegBytes = new Uint8Array(await readFile(outPath));
        if (jpegBytes.byteLength < 32) {
          warnings.push(`frame_empty_${index}`);
          continue;
        }
        frames.push({ index, timestampMs, jpegBytes });
      } catch {
        warnings.push(`frame_read_failed_${index}`);
      }
    }

    if (frames.length === 0) {
      return { ok: false, reason: 'empty_output', warnings: [...warnings, 'no_frames_extracted'] };
    }
    return { ok: true, frames, durationMs, warnings };
  } catch {
    return { ok: false, reason: 'sample_failed', warnings: [...warnings, 'sample_failed'] };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
