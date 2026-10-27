import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveTimelineAssetPath } from './local-encode';

/**
 * Deterministic local pixel ops only (contrast/brightness).
 * Never generative reconstruction / face synthesis — not COMPLETE for AI claims.
 */
export async function runLocalPixelOps(input: {
  sourceSrc: string;
  tributePublicId: string;
  requestId: string;
}): Promise<{ ok: true; relativePath: string } | { ok: false; reason: string }> {
  const source = await resolveTimelineAssetPath(input.sourceSrc, input.tributePublicId);
  if (!source) {
    return { ok: false, reason: 'source_missing' };
  }
  const relative = path.join('.data', 'enhancements', input.tributePublicId, `${input.requestId}.jpg`);
  const absolute = path.join(process.cwd(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });

  const result = await new Promise<{ code: number }>((resolve) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-i',
        source,
        '-vf',
        // Ceremony-screen local grade — deterministic pixel ops only (consent-gated).
        // Not generative restore / face synthesis. Orientation is handled at ingest.
        'scale=1920:1920:force_original_aspect_ratio=decrease:flags=lanczos,eq=contrast=1.1:brightness=0.025:saturation=1.06,colorbalance=rs=0.04:gs=0:bs=-0.03,unsharp=5:5:0.35:5:5:0.0',
        '-frames:v',
        '1',
        '-q:v',
        '2',
        absolute,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code });
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(124);
    }, 30_000);
    child.on('error', () => {
      finish(127);
    });
    child.on('close', (code) => {
      finish(code ?? 1);
    });
  });
  if (result.code !== 0) {
    return { ok: false, reason: `ffmpeg_${result.code}` };
  }
  try {
    await access(absolute);
  } catch {
    return { ok: false, reason: 'output_missing' };
  }
  return { ok: true, relativePath: relative };
}
