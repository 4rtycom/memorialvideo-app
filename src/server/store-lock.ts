import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { kvCommand, resolvePersistence } from './persistence';

/**
 * The creator store is one document. Every change is a read → modify → write of the whole
 * document, so two overlapping requests used to overwrite each other (ten photographs
 * uploaded at once left two).
 *
 * `withStoreLock` runs store changes one after another:
 *  - inside this process through a queue (re-entrant: a locked change may call another);
 *  - across serverless instances through a Redis lock (`SET NX PX`) when the store lives
 *    in Redis/KV, so two Vercel instances cannot write at the same time either.
 */
const LOCK_KEY = 'mv:store:lock';
const LOCK_TTL_MS = 30_000;
const LOCK_WAIT_MS = 25_000;

const holding = new AsyncLocalStorage<true>();
let tail: Promise<unknown> = Promise.resolve();

const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRemoteLock(): Promise<string> {
  const token = randomBytes(12).toString('hex');
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const result = await kvCommand(['SET', LOCK_KEY, token, 'NX', 'PX', LOCK_TTL_MS]);
    if (result === 'OK') return token;
    if (Date.now() > deadline) {
      throw new Error('store_lock_timeout');
    }
    await sleep(40 + Math.floor(Math.random() * 80));
  }
}

async function releaseRemoteLock(token: string): Promise<void> {
  try {
    await kvCommand(['EVAL', RELEASE_SCRIPT, 1, LOCK_KEY, token]);
  } catch {
    // The lock expires on its own after LOCK_TTL_MS.
  }
}

async function runLocked<T>(fn: () => Promise<T>): Promise<T> {
  let remote = false;
  try {
    remote = (await resolvePersistence()).kind === 'vercel_kv';
  } catch {
    remote = false;
  }
  if (!remote) {
    return holding.run(true, fn);
  }
  const token = await acquireRemoteLock();
  try {
    return await holding.run(true, fn);
  } finally {
    await releaseRemoteLock(token);
  }
}

export function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  if (holding.getStore()) {
    return fn();
  }
  const run = tail.then(() => runLocked(fn));
  // Keep the chain alive whether or not this change failed.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
