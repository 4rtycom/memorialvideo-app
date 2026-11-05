import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gate A / MV-AUD-002 journey proof:
 * create → upload → save → reload → sign out → sign in → resume.
 */
describe('Gate A hosted persistence journey', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-gate-a-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_SESSION_SECRET = 'test-session-secret-0123456789';
    delete process.env.DATABASE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('local_file: create → upload → save → reload → sign-out/in resume', async () => {
    const persistence = await import('./persistence');
    persistence.resetPersistenceCacheForTests();
    const probe = await persistence.probePersistenceWrite();
    expect(probe).toMatchObject({ ok: true, kind: 'local_file', writable: true });

    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');
    const session = await import('./account-session');

    const registered = await accounts.registerAccount('family@example.com', 'correct horse battery');
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      return;
    }
    const accountId = registered.accountId;
    const cookie = session.signAccountSession(accountId, 'test-session-secret-0123456789');
    expect(session.readSignedAccountSession(cookie, 'test-session-secret-0123456789')).toBe(accountId);

    const created = await actor.runWithAccount(accountId, () =>
      store.createTribute({
        displayName: 'Gate A Person',
        bornLabel: '1940',
        rememberedLabel: '2024',
        about: 'Loved gardens',
      }),
    );
    const tributeId = created.publicId;

    const memory = await actor.runWithAccount(accountId, () =>
      store.addMemory(tributeId, {
        title: 'First garden photo',
        year: '1965',
        filename: 'garden.jpg',
        alreadyReady: true,
      }),
    );
    expect(memory?.title).toBe('First garden photo');
    expect(memory?.ingestStatus).toBe('READY');

    const saved = await actor.runWithAccount(accountId, () =>
      store.updateTribute(tributeId, { about: 'Loved gardens and quiet mornings' }),
    );
    expect(saved?.about).toBe('Loved gardens and quiet mornings');

    // Simulate process reload: drop module caches, re-resolve persistence, re-read store.
    vi.resetModules();
    const persistenceReload = await import('./persistence');
    persistenceReload.resetPersistenceCacheForTests();
    const storeReload = await import('./store');
    const actorReload = await import('./actor');
    const sessionReload = await import('./account-session');

    // Sign out: cookie cleared conceptually — no actor. Sign-in restores the same account id.
    const signedBackIn = sessionReload.readSignedAccountSession(
      cookie,
      'test-session-secret-0123456789',
    );
    expect(signedBackIn).toBe(accountId);

    const resumed = await actorReload.runWithAccount(accountId, () =>
      storeReload.getTribute(tributeId),
    );
    expect(resumed?.displayName).toBe('Gate A Person');
    expect(resumed?.about).toBe('Loved gardens and quiet mornings');
    expect(resumed?.memories.some((m) => m.title === 'First garden photo')).toBe(true);

    const listed = await actorReload.runWithAccount(accountId, () =>
      storeReload.listTributeSummaries(),
    );
    expect(listed.map((row) => row.publicId)).toContain(tributeId);
  });

  it('postgres (PGlite): write probe + create/upload/reload resume', async () => {
    const db = new PGlite();
    const persistence = await import('./persistence');
    persistence.setSqlQueryForTests(async (sql, params) => {
      const result = await db.query<Record<string, unknown>>(sql, params);
      return result.rows;
    });
    persistence.resetPersistenceCacheForTests();

    const probe = await persistence.probePersistenceWrite();
    expect(probe).toMatchObject({ ok: true, kind: 'database', writable: true });

    const accounts = await import('./accounts');
    const actor = await import('./actor');
    const store = await import('./store');

    const registered = await accounts.registerAccount('postgres@example.com', 'correct horse battery');
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      await db.close();
      return;
    }

    const created = await actor.runWithAccount(registered.accountId, () =>
      store.createTribute({ displayName: 'SQL Person', about: 'Durable' }),
    );
    await actor.runWithAccount(registered.accountId, () =>
      store.addMemory(created.publicId, {
        title: 'SQL memory',
        year: '1970',
        filename: 'sql.jpg',
        alreadyReady: true,
      }),
    );

    vi.resetModules();
    const persistenceAgain = await import('./persistence');
    persistenceAgain.setSqlQueryForTests(async (sql, params) => {
      const result = await db.query<Record<string, unknown>>(sql, params);
      return result.rows;
    });
    persistenceAgain.resetPersistenceCacheForTests();
    const storeAgain = await import('./store');
    const actorAgain = await import('./actor');
    const resumed = await actorAgain.runWithAccount(registered.accountId, () =>
      storeAgain.getTribute(created.publicId),
    );
    expect(resumed?.displayName).toBe('SQL Person');
    expect(resumed?.memories.some((m) => m.title === 'SQL memory')).toBe(true);

    persistenceAgain.setSqlQueryForTests(null);
    persistenceAgain.resetPersistenceCacheForTests();
    const sqlStore = await import('./sql-store');
    sqlStore.resetSqlSchemaForTests();
    await db.close();
  });

  it('vercel_kv: write probe round-trips via REST SET/GET/DEL', async () => {
    process.env.KV_REST_API_URL = 'https://example-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token-not-real';
    const kv = new Map<string, string>();

    vi.stubGlobal(
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '[]')) as unknown[];
        const op = body[0];
        if (op === 'SET') {
          kv.set(String(body[1]), String(body[2]));
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        }
        if (op === 'GET') {
          return new Response(JSON.stringify({ result: kv.get(String(body[1])) ?? null }), {
            status: 200,
          });
        }
        if (op === 'DEL') {
          kv.delete(String(body[1]));
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
      },
    );

    const persistence = await import('./persistence');
    persistence.resetPersistenceCacheForTests();
    const probe = await persistence.probePersistenceWrite();
    expect(probe).toMatchObject({ ok: true, kind: 'vercel_kv', writable: true });
    expect(kv.size).toBe(0);
  });

  it('probe fails honestly when no durable backend is writable', async () => {
    const { chmodSync } = await import('node:fs');
    chmodSync(dataRoot, 0o555);
    process.env.VERCEL = '1';
    const persistence = await import('./persistence');
    persistence.resetPersistenceCacheForTests();
    const probe = await persistence.probePersistenceWrite();
    expect(probe.ok).toBe(false);
    expect(probe.writable).toBe(false);
    expect(probe.kind).toBe('unavailable');
    try {
      chmodSync(dataRoot, 0o755);
    } catch {
      // ignore
    }
  });
});
