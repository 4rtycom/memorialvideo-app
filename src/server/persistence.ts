import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { creatorEnv } from './env';

export type PersistenceKind = 'database' | 'vercel_kv' | 'local_file' | 'unavailable';

export type PersistenceResolution = {
  kind: PersistenceKind;
  /** True when create/update can persist without inventing secrets. */
  writable: boolean;
  /** XB-012 remains open when hosted DB/KV durability is missing. */
  xb012Persistence: boolean;
  reason:
    | 'database_preferred_unwired'
    | 'vercel_kv'
    | 'local_file'
    | 'local_file_not_writable'
    | 'no_durable_backend';
};

export class PersistenceUnavailableError extends Error {
  readonly code = 'persistence_unavailable' as const;
  readonly retryable = true;
  readonly xb012: boolean;
  readonly kind: PersistenceKind;

  constructor(message: string, input?: { xb012?: boolean; kind?: PersistenceKind }) {
    super(message);
    this.name = 'PersistenceUnavailableError';
    this.xb012 = input?.xb012 ?? true;
    this.kind = input?.kind ?? 'unavailable';
  }
}

const STORE_KEY = 'mv:creator:store:v5';

type KvConfig = {
  restUrl: string;
  token: string;
};

let cachedResolution: PersistenceResolution | null = null;
let localWritableProbe: Promise<boolean> | null = null;

export function resetPersistenceCacheForTests(): void {
  cachedResolution = null;
  localWritableProbe = null;
}

function readKvConfig(env: NodeJS.ProcessEnv = process.env): KvConfig | null {
  const restUrl = env.KV_REST_API_URL?.trim() || env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.KV_REST_API_TOKEN?.trim() || env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!restUrl || !token) {
    return null;
  }
  return { restUrl: restUrl.replace(/\/$/, ''), token };
}

export function isDatabasePersistenceConfigured(env = creatorEnv()): boolean {
  return Boolean(
    env.DATABASE_URL ||
      (env.SUPABASE_SERVICE_ROLE_KEY && env.NEXT_PUBLIC_SUPABASE_URL),
  );
}

async function probeLocalFileWritable(): Promise<boolean> {
  if (!localWritableProbe) {
    localWritableProbe = (async () => {
      const dir = path.join(process.cwd(), '.data');
      const probe = path.join(dir, `.writable-probe.${process.pid}.${Date.now()}`);
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(probe, 'ok', 'utf8');
        await unlink(probe);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return localWritableProbe;
}

/**
 * Resolve how creator state can be persisted on this host.
 * Writable backends first: Vercel KV (serverless-durable), then local file when the FS
 * allows it. When DATABASE/Supabase env is present but no writer is available, report
 * `database` (preferred production path) and refuse writes honestly — do not invent
 * secrets or pretend local_file works on read-only serverless disks.
 */
export async function resolvePersistence(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PersistenceResolution> {
  if (cachedResolution) {
    return cachedResolution;
  }

  const parsed = creatorEnv(env);
  const databaseConfigured = isDatabasePersistenceConfigured(parsed);
  const kv = readKvConfig(env);

  if (kv) {
    cachedResolution = {
      kind: 'vercel_kv',
      writable: true,
      xb012Persistence: false,
      reason: 'vercel_kv',
    };
    return cachedResolution;
  }

  const localWritable = await probeLocalFileWritable();
  if (localWritable) {
    cachedResolution = {
      kind: 'local_file',
      writable: true,
      // Local disk is fine for APP_ENV=local; on Vercel it is not production-durable.
      xb012Persistence: Boolean(env.VERCEL) || databaseConfigured,
      reason: 'local_file',
    };
    return cachedResolution;
  }

  if (databaseConfigured) {
    cachedResolution = {
      kind: 'database',
      writable: false,
      xb012Persistence: true,
      reason: 'database_preferred_unwired',
    };
    return cachedResolution;
  }

  cachedResolution = {
    kind: 'unavailable',
    writable: false,
    xb012Persistence: true,
    reason: env.VERCEL ? 'local_file_not_writable' : 'no_durable_backend',
  };
  return cachedResolution;
}

export async function assertPersistenceWritable(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PersistenceResolution> {
  const resolution = await resolvePersistence(env);
  if (!resolution.writable) {
    throw new PersistenceUnavailableError(
      resolution.reason === 'database_preferred_unwired'
        ? 'Hosted database is configured but creator document persistence is not wired yet.'
        : 'Durable tribute persistence is unavailable on this host.',
      { xb012: resolution.xb012Persistence, kind: resolution.kind },
    );
  }
  return resolution;
}

export function persistenceErrorResponse(error: PersistenceUnavailableError): {
  body: {
    error: 'persistence_unavailable';
    retryable: true;
    persistence: PersistenceKind;
    blockers: { xb012_docker_supabase: boolean };
  };
  status: 503;
} {
  return {
    status: 503,
    body: {
      error: 'persistence_unavailable',
      retryable: true,
      persistence: error.kind,
      blockers: {
        xb012_docker_supabase: error.xb012,
      },
    },
  };
}

export async function readKvStoreDocument(): Promise<string | null> {
  return readKvString(STORE_KEY);
}

export async function writeKvStoreDocument(json: string): Promise<void> {
  await writeKvString(STORE_KEY, json);
}

/** Low-level KV GET for opaque string documents (no PII keys). */
export async function readKvString(key: string): Promise<string | null> {
  const kv = readKvConfig();
  if (!kv) {
    throw new PersistenceUnavailableError('Vercel KV is not configured.', {
      kind: 'unavailable',
    });
  }
  const response = await fetch(kv.restUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['GET', key]),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new PersistenceUnavailableError(`Vercel KV read failed (${response.status}).`, {
      kind: 'vercel_kv',
    });
  }
  const payload = (await response.json()) as { result?: string | null };
  return typeof payload.result === 'string' ? payload.result : null;
}

/** Low-level KV SET for opaque string documents (no PII keys). */
export async function writeKvString(key: string, value: string): Promise<void> {
  const kv = readKvConfig();
  if (!kv) {
    throw new PersistenceUnavailableError('Vercel KV is not configured.', {
      kind: 'unavailable',
    });
  }
  const response = await fetch(kv.restUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, value]),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new PersistenceUnavailableError(`Vercel KV write failed (${response.status}).`, {
      kind: 'vercel_kv',
    });
  }
}

/** Low-level KV DEL for opaque keys. */
export async function deleteKvString(key: string): Promise<void> {
  const kv = readKvConfig();
  if (!kv) {
    throw new PersistenceUnavailableError('Vercel KV is not configured.', {
      kind: 'unavailable',
    });
  }
  const response = await fetch(kv.restUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['DEL', key]),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new PersistenceUnavailableError(`Vercel KV delete failed (${response.status}).`, {
      kind: 'vercel_kv',
    });
  }
}

export async function localStorePathExists(): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), '.data', 'creator-store.json'));
    return true;
  } catch {
    return false;
  }
}
