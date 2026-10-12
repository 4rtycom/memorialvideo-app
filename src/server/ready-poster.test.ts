import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('error', () => resolve(127));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

describe('creator READY poster still (ffmpeg, no Remotion)', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-poster-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('seeks deterministically inside the clip', async () => {
    const render = await import('./render');
    expect(render.readyPosterSeekSeconds(undefined)).toBe(0);
    expect(render.readyPosterSeekSeconds(0)).toBe(0);
    expect(render.readyPosterSeekSeconds(0.2)).toBeCloseTo(0.05, 5);
    expect(render.readyPosterSeekSeconds(4)).toBe(1);
    expect(render.readyPosterSeekSeconds(8)).toBe(1);
    expect(render.readyPosterSeekSeconds(2)).toBe(0.5);
  });

  it('extracts a JPEG beside an MP4 and resolves owner-only', async () => {
    const render = await import('./render');
    const store = await import('./store');
    const rendersDir = path.join(process.cwd(), '.data', 'renders');
    await mkdir(rendersDir, { recursive: true });
    const mp4Relative = path.join('.data', 'renders', 'rjob_poster_unit.mp4');
    const mp4Absolute = path.join(process.cwd(), mp4Relative);
    const code = await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x1c1917:s=320x180:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      mp4Absolute,
    ]);
    expect(code).toBe(0);

    const extracted = await render.extractReadyPosterStill({
      jobId: 'rjob_poster_unit',
      outputPath: mp4Relative,
      durationSeconds: 2,
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.posterRelative.endsWith('rjob_poster_unit.poster.jpg')).toBe(true);
    await access(path.join(process.cwd(), extracted.posterRelative));

    const tribute = await store.createTribute({ displayName: 'Poster Person' });
    const now = new Date().toISOString();
    await store.replaceRenderJobs(tribute.publicId, [
      {
        id: 'rjob_poster_unit',
        kind: 'final',
        status: 'READY',
        snapshotHash: 'a'.repeat(32),
        timelineVersion: 1,
        attemptCount: 1,
        queuedAt: now,
        updatedAt: now,
        lastHeartbeatAt: now,
        qcFailures: [],
        outputPath: mp4Relative,
        posterPath: extracted.posterRelative,
        outputVerified: true,
        failureReason: null,
      },
    ]);

    const resolved = await render.resolveOwnerPosterAbsolutePath('rjob_poster_unit');
    expect(resolved?.absolute.endsWith('.poster.jpg')).toBe(true);
    expect(resolved?.tributePublicId).toBe(tribute.publicId);
    expect(await render.resolveOwnerPosterAbsolutePath('rjob_missing_xxxx')).toBeNull();

    const skipped = await render.extractReadyPosterStill({
      jobId: 'rjob_marker',
      outputPath: path.join('.data', 'renders', 'rjob_marker.marker'),
    });
    expect(skipped.ok).toBe(false);
    if (skipped.ok) return;
    expect(skipped.reason).toBe('not_mp4');
  }, 60_000);

  it('poster failure never blocks READY status on QC pass', async () => {
    const render = await import('./render');
    const store = await import('./store');
    // Marker path: QC fails — no poster. Separate: QC-ready path uses real encode in local-encode.test.
    // Here assert extract failure leaves READY with null poster when we simulate post-QC attach.
    const tribute = await store.createTribute({ displayName: 'No Poster Person' });
    const now = new Date().toISOString();
    const missingMp4 = path.join('.data', 'renders', 'rjob_missing_mp4.mp4');
    await mkdir(path.dirname(path.join(process.cwd(), missingMp4)), { recursive: true });
    // Do not write the MP4 — extract must fail.
    const extracted = await render.extractReadyPosterStill({
      jobId: 'rjob_missing_mp4',
      outputPath: missingMp4,
      durationSeconds: 3,
    });
    expect(extracted.ok).toBe(false);

    await store.replaceRenderJobs(tribute.publicId, [
      {
        id: 'rjob_missing_mp4',
        kind: 'final',
        status: 'READY',
        snapshotHash: 'b'.repeat(32),
        timelineVersion: 1,
        attemptCount: 1,
        queuedAt: now,
        updatedAt: now,
        lastHeartbeatAt: now,
        qcFailures: [],
        outputPath: missingMp4,
        posterPath: null,
        outputVerified: true,
        failureReason: null,
      },
    ]);
    const reloaded = await store.getTribute(tribute.publicId);
    expect(reloaded?.renderJobs[0]?.status).toBe('READY');
    expect(reloaded?.renderJobs[0]?.posterPath).toBeNull();
    expect(await render.resolveOwnerPosterAbsolutePath('rjob_missing_mp4')).toBeNull();
  });
});
