import { afterEach, describe, expect, it, vi } from 'vitest';
import { creatorT } from './creator-ui-messages';
import {
  clearShellSaveRetry,
  hasShellSaveRetry,
  probeShellPersistence,
  runShellSaveRetry,
  setShellSaveRetry,
  shellSaveMessageKey,
  shellSaveNeedsRetry,
} from './shell-save-status';

describe('shell save status honesty (MV-AUD-002 / MV-AUD-013)', () => {
  afterEach(() => {
    clearShellSaveRetry();
  });

  it('never maps idle/checking/unavailable to a permanent Saved automatically claim', () => {
    expect(creatorT('en', shellSaveMessageKey('idle'))).toBe('Waiting to save');
    expect(creatorT('en', shellSaveMessageKey('checking'))).toBe('Checking save…');
    expect(creatorT('en', shellSaveMessageKey('unavailable'))).toBe(
      'Not saving — storage unavailable',
    );
    expect(creatorT('en', shellSaveMessageKey('saved'))).toBe('Saved');
    expect(creatorT('en', 'creator.saved')).not.toMatch(/automatically/i);
  });

  it('uses failure and offline copy when a write was not acknowledged', () => {
    expect(creatorT('en', shellSaveMessageKey('failed'))).toMatch(/Could not save/i);
    expect(creatorT('en', shellSaveMessageKey('offline'))).toMatch(/not saved/i);
    expect(creatorT('en', 'creator.save.retry')).toBe('Retry');
  });

  it('offers retry only for failed, offline, and unavailable', () => {
    expect(shellSaveNeedsRetry('failed')).toBe(true);
    expect(shellSaveNeedsRetry('offline')).toBe(true);
    expect(shellSaveNeedsRetry('unavailable')).toBe(true);
    expect(shellSaveNeedsRetry('idle')).toBe(false);
    expect(shellSaveNeedsRetry('saving')).toBe(false);
    expect(shellSaveNeedsRetry('saved')).toBe(false);
    expect(shellSaveNeedsRetry('checking')).toBe(false);
  });

  it('probes persistence without claiming saved', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ persistenceWritable: true }),
    ) as unknown as typeof fetch;
    await expect(probeShellPersistence(fetchImpl)).resolves.toBe('idle');

    const unavailable = vi.fn(async () =>
      Response.json({ persistenceWritable: false }),
    ) as unknown as typeof fetch;
    await expect(probeShellPersistence(unavailable)).resolves.toBe('unavailable');

    const offline = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    await expect(probeShellPersistence(offline)).resolves.toBe('offline');
  });

  it('retries safely: probe first, then replay one pending mutation', async () => {
    const replay = vi.fn();
    setShellSaveRetry(replay);
    expect(hasShellSaveRetry()).toBe(true);

    const blocked = vi.fn(async () =>
      Response.json({ persistenceWritable: false }),
    ) as unknown as typeof fetch;
    await expect(runShellSaveRetry(blocked)).resolves.toEqual({
      kind: 'probe',
      state: 'unavailable',
    });
    expect(replay).not.toHaveBeenCalled();

    const ok = vi.fn(async () =>
      Response.json({ persistenceWritable: true }),
    ) as unknown as typeof fetch;
    await expect(runShellSaveRetry(ok)).resolves.toEqual({ kind: 'replayed' });
    expect(replay).toHaveBeenCalledTimes(1);

    clearShellSaveRetry();
    await expect(runShellSaveRetry(ok)).resolves.toEqual({ kind: 'probe', state: 'idle' });
  });
});
