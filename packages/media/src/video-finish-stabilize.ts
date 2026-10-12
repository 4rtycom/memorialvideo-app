/**
 * MV-127 local Memorial Finish video spike.
 * Conservative ffmpeg trim + mild denoise/deshake — not generative restore/upscale.
 */
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { sniffMime } from './sniff';
import { probeMp4 } from './video-probe';

const require = createRequire(import.meta.url);

export const FINISH_VIDEO_MAX_INPUT_BYTES = 200 * 1024 * 1024;
export const FINISH_VIDEO_MAX_RANGE_MS = 60_000;

export type LocalVideoFinishStabilizeResult =
  | {
      ok: true;
      bytes: Uint8Array;
      mime: 'video/mp4';
      operation: 'stabilize_local_ffmpeg';
      generative: false;
      mutatesOriginal: false;
      warnings: string[];
    }
  | {
      ok: false;
      reason:
        | 'ffmpeg_unavailable'
        | 'unsupported_input'
        | 'too_large'
        | 'invalid_range'
        | 'stabilize_failed'
        | 'empty_output';
      warnings: string[];
    };

async function resolveFfmpegPath(): Promise<string | null> {
  const candidates: string[] = [];
  try {
    const candidate = require('ffmpeg-static') as string | null;
    if (candidate && typeof candidate === 'string') {
      candidates.push(candidate);
    }
  } catch {
    // optional
  }
  if (process.env.FFMPEG_PATH?.trim()) {
    candidates.push(process.env.FFMPEG_PATH.trim());
  }
  candidates.push('/usr/bin/ffmpeg', 'ffmpeg');
  for (const bin of candidates) {
    try {
      await access(bin);
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

export async function finishVideoFfmpegAvailable(): Promise<boolean> {
  return Boolean(await resolveFfmpegPath());
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

/**
 * Trim a video range and apply mild local denoise/deshake.
 * Does not invent frames, faces, or speech — authenticity lock preserved.
 */
export async function stabilizeLocalFinishVideoRange(input: {
  bytes: Uint8Array;
  startMs: number;
  endMs: number;
}): Promise<LocalVideoFinishStabilizeResult> {
  if (input.bytes.byteLength > FINISH_VIDEO_MAX_INPUT_BYTES) {
    return { ok: false, reason: 'too_large', warnings: ['too_large'] };
  }
  if (
    !Number.isFinite(input.startMs) ||
    !Number.isFinite(input.endMs) ||
    input.startMs < 0 ||
    input.endMs <= input.startMs ||
    input.endMs - input.startMs > FINISH_VIDEO_MAX_RANGE_MS
  ) {
    return { ok: false, reason: 'invalid_range', warnings: ['invalid_range'] };
  }
  const mime = sniffMime(input.bytes);
  const probe = mime === 'video/mp4' || mime === 'unknown' ? probeMp4(input.bytes) : null;
  if (mime !== 'video/mp4' && !(probe?.hasVideo)) {
    return { ok: false, reason: 'unsupported_input', warnings: ['unsupported_input'] };
  }
  const bin = await resolveFfmpegPath();
  if (!bin) {
    return { ok: false, reason: 'ffmpeg_unavailable', warnings: ['ffmpeg_unavailable'] };
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mv-finish-vid-'));
  const inputPath = path.join(tmp, 'in.mp4');
  const outputPath = path.join(tmp, 'out.mp4');
  const warnings: string[] = [];
  try {
    await writeFile(inputPath, input.bytes);
    const startSec = (input.startMs / 1000).toFixed(3);
    const durationSec = ((input.endMs - input.startMs) / 1000).toFixed(3);
    // Mild hqdn3d + deshake; re-encode H.264/AAC for Remotion-friendly MP4.
    const filters = 'hqdn3d=1.5:1.5:6:6,deshake';
    const first = await runFfmpeg(bin, [
      '-y',
      '-ss',
      startSec,
      '-i',
      inputPath,
      '-t',
      durationSec,
      '-vf',
      filters,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
    if (first.code !== 0) {
      // Fallback: trim only (still derived bytes, no generative restore).
      warnings.push('deshake_unavailable_trim_only');
      const trimOnly = await runFfmpeg(bin, [
        '-y',
        '-ss',
        startSec,
        '-i',
        inputPath,
        '-t',
        durationSec,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
      if (trimOnly.code !== 0) {
        return { ok: false, reason: 'stabilize_failed', warnings: [...warnings, 'stabilize_failed'] };
      }
    }
    const out = await readFile(outputPath);
    if (out.byteLength < 32) {
      return { ok: false, reason: 'empty_output', warnings: [...warnings, 'empty_output'] };
    }
    return {
      ok: true,
      bytes: new Uint8Array(out),
      mime: 'video/mp4',
      operation: 'stabilize_local_ffmpeg',
      generative: false,
      mutatesOriginal: false,
      warnings,
    };
  } catch {
    return { ok: false, reason: 'stabilize_failed', warnings: ['stabilize_failed'] };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
