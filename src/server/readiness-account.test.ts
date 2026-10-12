import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator readiness + account delete', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-acc-'));
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

  it('evaluates ceremony readiness without inventing people/moderation signals', async () => {
    const store = await import('./store');
    const readiness = await import('./readiness-local');
    const created = await store.createTribute({ displayName: 'Ready Check' });
    const evaluated = await readiness.evaluateCreatorReadiness(created);
    expect(evaluated.report.singleScoreInsufficient).toBe(true);
    expect(evaluated.report.activeBlockingCount).toBeGreaterThan(0);
    expect(evaluated.packAllowed).toBe(false);
    const summary = readiness.summarizeReadiness(evaluated.report);
    expect(summary.findings.some((f: { code: string }) => f.code === 'playback_not_ready')).toBe(
      true,
    );
  });

  it('deletes a tribute from the local store', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Delete Me' });
    expect(await store.getTribute(created.publicId)).toBeTruthy();
    expect(await store.deleteTribute(created.publicId)).toBe(true);
    expect(await store.getTribute(created.publicId)).toBeNull();
    const listed = await store.listTributeSummaries();
    expect(listed.find((t) => t.publicId === created.publicId)).toBeUndefined();
  });
});
