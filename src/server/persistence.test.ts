import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

describe('creator persistence resolution', () => {
  let cwd: string;
  let dataRoot: string;
  const previousEnv = { ...process.env };

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-persist-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env = {
      ...previousEnv,
      APP_ENV: 'local',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3002',
    };
    delete process.env.VERCEL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    process.env = { ...previousEnv };
    vi.resetModules();
  });

  it('uses local_file when the workspace .data directory is writable', async () => {
    const persistence = await import('./persistence');
    const resolved = await persistence.resolvePersistence();
    expect(resolved).toMatchObject({
      kind: 'local_file',
      writable: true,
      reason: 'local_file',
    });
  });

  it('prefers vercel_kv when REST credentials are present', async () => {
    process.env.KV_REST_API_URL = 'https://example-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token-not-real';
    const persistence = await import('./persistence');
    const resolved = await persistence.resolvePersistence();
    expect(resolved).toEqual({
      kind: 'vercel_kv',
      writable: true,
      xb012Persistence: false,
      reason: 'vercel_kv',
    });
  });

  it('returns unavailable on read-only serverless hosts without KV or database', async () => {
    chmodSync(dataRoot, 0o555);
    process.env.VERCEL = '1';
    const persistence = await import('./persistence');
    const resolved = await persistence.resolvePersistence();
    expect(resolved.kind).toBe('unavailable');
    expect(resolved.writable).toBe(false);
    expect(resolved.xb012Persistence).toBe(true);
    expect(resolved.reason).toBe('local_file_not_writable');

    await expect(persistence.assertPersistenceWritable()).rejects.toMatchObject({
      code: 'persistence_unavailable',
      retryable: true,
    });

    const mapped = persistence.persistenceErrorResponse(
      new persistence.PersistenceUnavailableError('Durable tribute persistence is unavailable on this host.', {
        kind: 'unavailable',
        xb012: true,
      }),
    );
    expect(mapped.status).toBe(503);
    expect(mapped.body).toEqual({
      error: 'persistence_unavailable',
      retryable: true,
      persistence: 'unavailable',
      blockers: { xb012_docker_supabase: true },
    });
  });

  it('reports database preferred-but-unwired when only a service role is set and disk is not writable', async () => {
    chmodSync(dataRoot, 0o555);
    process.env.VERCEL = '1';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-not-real';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const persistence = await import('./persistence');
    const resolved = await persistence.resolvePersistence();
    expect(resolved).toEqual({
      kind: 'database',
      writable: false,
      xb012Persistence: true,
      reason: 'database_preferred_unwired',
    });
  });

  it('treats DATABASE_URL as a wired PostgreSQL store', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/memorial';
    const persistence = await import('./persistence');
    const resolved = await persistence.resolvePersistence();
    expect(resolved).toEqual({
      kind: 'database',
      writable: true,
      xb012Persistence: false,
      reason: 'postgres',
    });
  });
});

describe('POST /api/tributes persistence failure mode', () => {
  let cwd: string;
  let dataRoot: string;
  const previousEnv = { ...process.env };

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-tributes-api-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    chmodSync(dataRoot, 0o555);
    vi.resetModules();
    process.env = {
      ...previousEnv,
      APP_ENV: 'local',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3002',
      VERCEL: '1',
    };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    try {
      chmodSync(dataRoot, 0o755);
    } catch {
      // ignore
    }
    rmSync(dataRoot, { recursive: true, force: true });
    process.env = { ...previousEnv };
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('createTribute throws persistence_unavailable instead of a raw FS stack', async () => {
    const store = await import('./store');
    const persistence = await import('./persistence');
    await expect(store.createTribute({ displayName: 'Smoke Person' })).rejects.toBeInstanceOf(
      persistence.PersistenceUnavailableError,
    );
  });

  it('returns honest 503 persistence_unavailable JSON instead of a raw 500', async () => {
    const route = await import('../app/api/tributes/route');
    const response = await route.POST(
      new Request('http://127.0.0.1:3002/api/tributes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Smoke Person' }),
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'persistence_unavailable',
      retryable: true,
      persistence: 'unavailable',
      blockers: { xb012_docker_supabase: true },
    });
  });
});
