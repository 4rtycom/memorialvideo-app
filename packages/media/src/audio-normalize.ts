import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { sniffMime } from './sniff';

const require = createRequire(import.meta.url);

export const TRANSCRIBABLE_INPUT_MIMES = [
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'video/mp4',
  'video/quicktime',
] as const;

export type TranscribableInputMime = (typeof TRANSCRIBABLE_INPUT_MIMES)[number] | 'unknown';

export type AudioNormalizeResult =
  | {
      ok: true;
      wavBytes: Uint8Array;
      sourceMime: TranscribableInputMime | 'audio/wav';
      normalized: boolean;
      durationMsHint: number | null;
      warnings: string[];
    }
  | {
      ok: false;
      reason:
        | 'ffmpeg_unavailable'
        | 'unsupported_input'
        | 'too_large'
        | 'normalize_failed'
        | 'no_audio_stream'
        | 'empty_output';
      warnings: string[];
    };

export const MAX_TRANSCRIBE_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_TRANSCRIBE_DURATION_SEC = 10 * 60;
export const ASR_SAMPLE_RATE = 16_000;

function resolveFfmpegPath(): string | null {
  try {
    const candidate = require('ffmpeg-static') as string | null;
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
  } catch {
    // optional binary missing
  }
  return process.env.FFMPEG_PATH?.trim() || null;
}

export async function ffmpegAvailable(): Promise<boolean> {
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

function classifyTranscribeMime(bytes: Uint8Array, mimeHint?: string): TranscribableInputMime | 'audio/wav' {
  const sniffed = sniffMime(bytes);
  if (sniffed === 'audio/wav') {
    return 'audio/wav';
  }
  if (sniffed === 'audio/mpeg') {
    return 'audio/mpeg';
  }
  if (sniffed === 'video/mp4') {
    const hint = (mimeHint ?? '').toLowerCase();
    if (hint.includes('m4a') || hint === 'audio/mp4' || hint === 'audio/x-m4a' || hint === 'audio/aac') {
      return 'audio/mp4';
    }
    if (hint.includes('quicktime') || hint.includes('mov')) {
      return 'video/quicktime';
    }
    return 'video/mp4';
  }
  const hint = (mimeHint ?? '').toLowerCase();
  if (hint.includes('mpeg') || hint.includes('mp3')) {
    return 'audio/mpeg';
  }
  if (hint.includes('m4a') || hint === 'audio/mp4' || hint === 'audio/aac') {
    return 'audio/mp4';
  }
  if (hint.includes('quicktime') || hint.includes('mov')) {
    return 'video/quicktime';
  }
  if (hint.includes('mp4') || hint.includes('video')) {
    return 'video/mp4';
  }
  return 'unknown';
}

function runFfmpeg(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const chunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => {
      if (chunks.reduce((sum, part) => sum + part.length, 0) < 32_000) {
        chunks.push(chunk);
      }
    });
    child.on('error', () => resolve({ code: 1, stderr: 'spawn_failed' }));
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr: Buffer.concat(chunks).toString('utf8').slice(0, 4000) });
    });
  });
}

/**
 * Convert supported audio/video bytes into mono 16 kHz PCM WAV for local ASR.
 * Uses explicit argv arrays only (no shell). Original bytes are never modified.
 */
export async function normalizeAudioForTranscription(input: {
  bytes: Uint8Array;
  mimeHint?: string;
  tempRoot?: string;
  maxBytes?: number;
  maxDurationSec?: number;
}): Promise<AudioNormalizeResult> {
  const warnings: string[] = [];
  if (input.bytes.length === 0) {
    return { ok: false, reason: 'empty_output', warnings: ['empty_input'] };
  }
  const maxBytes = input.maxBytes ?? MAX_TRANSCRIBE_INPUT_BYTES;
  if (input.bytes.length > maxBytes) {
    return { ok: false, reason: 'too_large', warnings: ['input_too_large'] };
  }

  const sourceMime = classifyTranscribeMime(input.bytes, input.mimeHint);
  if (sourceMime === 'audio/wav') {
    return {
      ok: true,
      wavBytes: input.bytes,
      sourceMime,
      normalized: false,
      durationMsHint: null,
      warnings,
    };
  }
  if (sourceMime === 'unknown') {
    return { ok: false, reason: 'unsupported_input', warnings: ['unsupported_codec'] };
  }

  const bin = resolveFfmpegPath();
  if (!bin) {
    return { ok: false, reason: 'ffmpeg_unavailable', warnings: ['ffmpeg_unavailable'] };
  }

  const root = input.tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), 'mv-asr-')));
  const ownedTemp = !input.tempRoot;
  await mkdir(root, { recursive: true });
  const inPath = path.join(root, 'input.bin');
  const outPath = path.join(root, 'pcm16k.wav');
  const maxDuration = input.maxDurationSec ?? MAX_TRANSCRIBE_DURATION_SEC;

  try {
    await writeFile(inPath, Buffer.from(input.bytes));
    // Explicit argv only — never interpolate into a shell string.
    const args = [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      inPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(ASR_SAMPLE_RATE),
      '-c:a',
      'pcm_s16le',
      '-t',
      String(maxDuration),
      outPath,
    ];
    const result = await runFfmpeg(bin, args);
    if (result.code !== 0) {
      const noAudio =
        /does not contain any stream|Output file does not contain any stream|matches no streams|no audio/i.test(
          result.stderr,
        );
      return {
        ok: false,
        reason: noAudio ? 'no_audio_stream' : 'normalize_failed',
        warnings: [noAudio ? 'no_audio_stream' : 'normalize_failed'],
      };
    }
    const wavBytes = new Uint8Array(await readFile(outPath));
    if (wavBytes.length < 64) {
      return { ok: false, reason: 'empty_output', warnings: ['empty_pcm'] };
    }
    if (sourceMime.startsWith('video/')) {
      warnings.push('demuxed_from_video');
    } else {
      warnings.push('normalized_to_pcm_wav');
    }
    return {
      ok: true,
      wavBytes,
      sourceMime,
      normalized: true,
      durationMsHint: null,
      warnings,
    };
  } finally {
    if (ownedTemp) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    } else {
      await rm(inPath, { force: true }).catch(() => undefined);
      await rm(outPath, { force: true }).catch(() => undefined);
    }
  }
}
