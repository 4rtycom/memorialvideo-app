import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('store changes are serialised', () => {
  let cwd: string;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mv-lock-'));
    cwd = process.cwd();
    process.chdir(root);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    delete process.env.DATABASE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
    vi.resetModules();
  });

  it('keeps every one of ten accounts registered at the same time', async () => {
    const accounts = await import('./accounts');
    const store = await import('./store');
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => accounts.registerAccount(`user${i}@example.com`, 'a long enough password')),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const saved = await store.loadCreatorStore();
    expect(Object.keys(saved.accounts)).toHaveLength(10);
  });

  it('is re-entrant and survives a failing change', async () => {
    const { withStoreLock } = await import('./store-lock');
    const order: string[] = [];
    await expect(withStoreLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await withStoreLock(async () => {
      order.push('outer');
      await withStoreLock(async () => { order.push('inner'); });
    });
    expect(order).toEqual(['outer', 'inner']);
  });

  it('takes and releases a Redis lock when the store lives in Redis', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'token-token-token';
    vi.resetModules();
    const commands: string[] = [];
    let held = false;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const command = JSON.parse(String(init.body)) as unknown[];
      commands.push(String(command[0]));
      if (command[0] === 'SET' && command[2] !== undefined && command.includes('NX')) {
        const ok = !held;
        held = true;
        return new Response(JSON.stringify({ result: ok ? 'OK' : null }));
      }
      if (command[0] === 'EVAL') held = false;
      return new Response(JSON.stringify({ result: 1 }));
    });
    const { withStoreLock } = await import('./store-lock');
    const value = await withStoreLock(async () => 42);
    expect(value).toBe(42);
    expect(commands).toEqual(['SET', 'EVAL']);
    expect(held).toBe(false);
  });
});
