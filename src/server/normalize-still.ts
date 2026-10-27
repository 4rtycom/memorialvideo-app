import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** Longest edge after ingest normalize — ceremony-screen ready without AI upscale. */
export const MAX_STILL_EDGE_PX = 2560;

/**
 * ffmpeg filter: autorotate is applied by the demuxer for JPEG EXIF;
 * scale keeps aspect and caps the long edge; even dims keep libx264 happy downstream.
 */
export function buildStillNormalizeFilter(maxEdge = MAX_STILL_EDGE_PX): string {
  const edge = Math.max(640, Math.min(4096, Math.round(maxEdge)));
  // force_original_aspect_ratio=decrease keeps the long edge ≤ max without upscaling small photos.
  // ffmpeg applies JPEG EXIF orientation by default before filters.
  return [
    `scale=${edge}:${edge}:force_original_aspect_ratio=decrease:flags=lanczos`,
    'setsar=1',
    'format=yuvj420p',
  ].join(',');
}

export type NormalizeStillResult =
  | { ok: true; absolutePath: string; normalized: boolean; widthHint?: number; heightHint?: number }
  | { ok: false; reason: string };

/**
 * Orient + downscale a still into a durable JPEG beside the original bytes.
 * Does not mutate the original upload; returns the normalized path when successful.
 * HEIC is not converted here — callers must leave those in needs_attention.
 */
export async function normalizeStillWithFfmpeg(input: {
  sourceAbsolute: string;
  outputAbsolute: string;
  maxEdge?: number;
}): Promise<NormalizeStillResult> {
  try {
    await access(input.sourceAbsolute);
  } catch {
    return { ok: false, reason: 'source_missing' };
  }

  await mkdir(path.dirname(input.outputAbsolute), { recursive: true });
  // Per-call temp: overlapping ingest ticks share a pid and must not tear one JPEG.
  const tmp = `${input.outputAbsolute}.${process.pid}.${crypto.randomUUID()}.tmp.jpg`;
  const vf = buildStillNormalizeFilter(input.maxEdge ?? MAX_STILL_EDGE_PX);

  try {
    const code = await new Promise<number>((resolve) => {
      const child = spawn(
        'ffmpeg',
        [
          '-y',
          '-i',
          input.sourceAbsolute,
          '-vf',
          vf,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          tmp,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let settled = false;
      const finish = (exit: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(exit);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(124);
      }, 45_000);
      child.on('error', () => finish(127));
      child.on('close', (exit) => finish(exit ?? 1));
    });

    if (code !== 0) {
      return { ok: false, reason: `ffmpeg_${code}` };
    }

    try {
      const info = await stat(tmp);
      if (info.size < 32) {
        return { ok: false, reason: 'output_empty' };
      }
      await rename(tmp, input.outputAbsolute);
    } catch {
      try {
        await copyFile(tmp, input.outputAbsolute);
      } catch {
        return { ok: false, reason: 'output_write_failed' };
      }
    }

    return { ok: true, absolutePath: input.outputAbsolute, normalized: true };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** Derived normalized still path for a media asset (sibling of the raw object). */
export function normalizedStillAbsolutePath(sourceAbsolute: string): string {
  return `${sourceAbsolute}.normalized.jpg`;
}
