import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  finishVideoFfmpegAvailable,
  stabilizeLocalFinishVideoRange,
} from './video-finish-stabilize';

async function synthesizeTinyMp4(): Promise<Uint8Array | null> {
  const available = await finishVideoFfmpegAvailable();
  if (!available) {
    return null;
  }
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mv-finish-synth-'));
  const out = path.join(tmp, 'clip.mp4');
  try {
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.env.FFMPEG_PATH?.trim() || '/usr/bin/ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=gray:s=320x240:d=1.2',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1.2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          out,
        ],
        { windowsHide: true },
      );
      child.on('error', () => resolve(1));
      child.on('close', (exit) => resolve(exit));
    });
    if (code !== 0) {
      return null;
    }
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

describe('local Finish video stabilize spike (MV-127)', () => {
  it('rejects invalid ranges without touching originals', async () => {
    const result = await stabilizeLocalFinishVideoRange({
      bytes: new Uint8Array([0, 0, 0, 0]),
      startMs: 10,
      endMs: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_range');
    }
  });

  it('produces a derived MP4 clip via local ffmpeg (not generative restore)', async () => {
    const available = await finishVideoFfmpegAvailable();
    if (!available) {
      expect(available).toBe(false);
      return;
    }
    const bytes = await synthesizeTinyMp4();
    if (!bytes) {
      expect(bytes).not.toBeNull();
      return;
    }
    const result = await stabilizeLocalFinishVideoRange({
      bytes,
      startMs: 0,
      endMs: 800,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.generative).toBe(false);
    expect(result.mutatesOriginal).toBe(false);
    expect(result.operation).toBe('stabilize_local_ffmpeg');
    expect(result.bytes.byteLength).toBeGreaterThan(32);
    expect(result.mime).toBe('video/mp4');
  });
});
