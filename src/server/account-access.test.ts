import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('account isolation', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-accounts-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = 'test-session-secret-0123456789';
    delete process.env.DATABASE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('keeps a signed-in tribute after reload and hides it from another account', async () => {
    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');

    const first = await accounts.registerAccount('ada@example.com', 'correct horse battery');
    const second = await accounts.registerAccount('grace@example.com', 'another secret phrase');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const created = await actor.runWithAccount(first.accountId, () =>
      store.createTribute({
        displayName: 'Ada Lovelace',
        bornLabel: '1815',
        rememberedLabel: '1852',
        about: 'Mathematician',
      }),
    );
    expect(created.ownerAccountId).toBe(first.accountId);

    const reloaded = await actor.runWithAccount(first.accountId, () => store.getTribute(created.publicId));
    expect(reloaded?.displayName).toBe('Ada Lovelace');
    expect(reloaded?.about).toBe('Mathematician');

    const denied = await actor.runWithAccount(second.accountId, () => store.getTribute(created.publicId));
    expect(denied).toBeNull();
    const listed = await actor.runWithAccount(second.accountId, () => store.listTributeSummaries());
    expect(listed).toEqual([]);

    const removed = await actor.runWithAccount(second.accountId, () => store.deleteTribute(created.publicId));
    expect(removed).toBe(false);
    const stillThere = await actor.runWithAccount(first.accountId, () => store.getTribute(created.publicId));
    expect(stillThere?.publicId).toBe(created.publicId);
  });

  it('signs a session cookie that round-trips the account id', async () => {
    const session = await import('./account-session');
    const token = session.signAccountSession('acc_0123456789abcdef', 'test-session-secret-0123456789');
    expect(session.readSignedAccountSession(token, 'test-session-secret-0123456789')).toBe(
      'acc_0123456789abcdef',
    );
    expect(session.readSignedAccountSession(token, 'other-session-secret-xxxx')).toBeNull();
    expect(session.readSignedAccountSession(`${token}x`, 'test-session-secret-0123456789')).toBeNull();
  });
});
