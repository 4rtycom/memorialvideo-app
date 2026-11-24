import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('password reset', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-reset-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.CREATOR_SESSION_SECRET = 'test-session-secret-0123456789';
    delete process.env.DATABASE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('lets a token set a new password exactly once', async () => {
    const accounts = await import('./accounts');
    await accounts.registerAccount('ada@example.com', 'correct horse battery');

    const reset = await accounts.createPasswordReset('Ada@Example.com');
    expect(reset).not.toBeNull();
    if (!reset) return;

    const done = await accounts.completePasswordReset(reset.token, 'a brand new passphrase');
    expect(done.ok).toBe(true);
    expect((await accounts.authenticateAccount('ada@example.com', 'a brand new passphrase')).ok).toBe(true);
    expect((await accounts.authenticateAccount('ada@example.com', 'correct horse battery')).ok).toBe(false);

    const again = await accounts.completePasswordReset(reset.token, 'yet another passphrase');
    expect(again.ok).toBe(false);
  });

  it('gives nothing for unknown addresses and rejects expired or short-password attempts', async () => {
    const accounts = await import('./accounts');
    await accounts.registerAccount('ada@example.com', 'correct horse battery');
    expect(await accounts.createPasswordReset('nobody@example.com')).toBeNull();

    const reset = await accounts.createPasswordReset('ada@example.com');
    if (!reset) throw new Error('expected a token');
    expect((await accounts.completePasswordReset(reset.token, 'short')).ok).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60_000);
    expect((await accounts.completePasswordReset(reset.token, 'a brand new passphrase')).ok).toBe(false);
  });

  it('sends through Resend with the key and never logs the address', async () => {
    process.env.EMAIL_PROVIDER_API_KEY = 're_test_key_123456';
    process.env.EMAIL_FROM = 'MemorialVideo <hello@example.com>';
    const { sendEmail } = await import('./email');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await sendEmail(
      { to: 'ada@example.com', subject: 's', text: 't', html: '<p>t</p>' },
      { fetchFn: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch },
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key_123456');
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.EMAIL_FROM;
  });
});
