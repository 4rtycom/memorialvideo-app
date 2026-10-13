import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('postgres tribute document', () => {
  let cwd: string;
  let dataRoot: string;
  let db: PGlite;

  beforeEach(async () => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-sql-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    db = new PGlite();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    delete process.env.DATABASE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(async () => {
    const persistence = await import('./persistence');
    persistence.setSqlQueryForTests(null);
    persistence.resetPersistenceCacheForTests();
    const sqlStore = await import('./sql-store');
    sqlStore.resetSqlSchemaForTests();
    await db.close();
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('reloads a tribute from PostgreSQL and denies a role without table grant', async () => {
    const persistence = await import('./persistence');
    persistence.setSqlQueryForTests(async (sql, params) => {
      const result = await db.query<Record<string, unknown>>(sql, params);
      return result.rows;
    });
    persistence.resetPersistenceCacheForTests();

    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Grace Hopper', about: 'Computer scientist' });
    vi.resetModules();
    const persistenceAgain = await import('./persistence');
    persistenceAgain.setSqlQueryForTests(async (sql, params) => {
      const result = await db.query<Record<string, unknown>>(sql, params);
      return result.rows;
    });
    persistenceAgain.resetPersistenceCacheForTests();
    const reloadedStore = await import('./store');
    const reloaded = await reloadedStore.getTribute(created.publicId);
    expect(reloaded?.displayName).toBe('Grace Hopper');
    expect(reloaded?.about).toBe('Computer scientist');

    await db.exec(`create role public_probe nologin`);
    await expect(db.exec(`set role public_probe; select document from creator_store;`)).rejects.toThrow();
    await db.exec(`reset role`);
  });
});
