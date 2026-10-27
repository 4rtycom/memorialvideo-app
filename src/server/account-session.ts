import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { authenticateAccount, registerAccount, type AccountResult } from './accounts';
import { runWithAccount } from './actor';
import { creatorEnv } from './env';

export const ACCOUNT_COOKIE = 'mv_creator_account';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export class AuthRequiredError extends Error {
  readonly code = 'auth_required' as const;

  constructor() {
    super('auth_required');
    this.name = 'AuthRequiredError';
  }
}

export class AuthNotConfiguredError extends Error {
  readonly code = 'auth_not_configured' as const;

  constructor() {
    super('auth_not_configured');
    this.name = 'AuthNotConfiguredError';
  }
}

function sessionSecretFromEnv(): string | null {
  const secret = process.env.CREATOR_SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}

async function localSessionSecretFile(): Promise<string | null> {
  if (creatorEnv().APP_ENV !== 'local') {
    return null;
  }
  const dir = path.join(process.cwd(), '.data');
  const file = path.join(dir, 'session-secret');
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    if (existing.length >= 16) {
      return existing;
    }
  } catch {
    // Create below when the directory is writable.
  }
  try {
    await mkdir(dir, { recursive: true });
    const created = randomBytes(32).toString('base64url');
    await writeFile(file, `${created}\n`, { encoding: 'utf8', mode: 0o600 });
    return created;
  } catch {
    return null;
  }
}

export async function resolveSessionSecret(): Promise<string | null> {
  return sessionSecretFromEnv() ?? (await localSessionSecretFile());
}

export function signAccountSession(accountId: string, secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const body = `${accountId}.${exp}`;
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function readSignedAccountSession(token: string, secret: string, nowMs = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [accountId, expText, signature] = parts;
  if (!accountId || !/^acc_[a-f0-9]{16}$/.test(accountId) || !expText || !signature) {
    return null;
  }
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(`${accountId}.${expText}`).digest('base64url');
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  return accountId;
}

export async function readAccountSession(): Promise<string | null> {
  const secret = await resolveSessionSecret();
  if (!secret) {
    return null;
  }
  const jar = await cookies();
  const token = jar.get(ACCOUNT_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return readSignedAccountSession(token, secret);
}

async function writeSessionCookie(accountId: string): Promise<void> {
  const secret = await resolveSessionSecret();
  if (!secret) {
    throw new AuthNotConfiguredError();
  }
  const jar = await cookies();
  jar.set(ACCOUNT_COOKIE, signAccountSession(accountId, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
    secure: creatorEnv().APP_ENV !== 'local',
  });
}

export async function clearAccountSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCOUNT_COOKIE);
}

export async function signInWithPassword(email: string, password: string): Promise<AccountResult> {
  const secret = await resolveSessionSecret();
  if (!secret) {
    throw new AuthNotConfiguredError();
  }
  const result = await authenticateAccount(email, password);
  if (!result.ok) {
    return result;
  }
  await writeSessionCookie(result.accountId);
  return result;
}

export async function registerAndSignIn(email: string, password: string): Promise<AccountResult> {
  const secret = await resolveSessionSecret();
  if (!secret) {
    throw new AuthNotConfiguredError();
  }
  const result = await registerAccount(email, password);
  if (!result.ok) {
    return result;
  }
  await writeSessionCookie(result.accountId);
  return result;
}

/**
 * Owner routes run inside the signed-in account.
 * Local demo mode without a session keeps the previous unsigned file store.
 * Any other environment refuses unsigned owner access.
 */
export async function withRequestOwner<T>(fn: () => Promise<T>): Promise<T> {
  const accountId = await readAccountSession();
  if (accountId) {
    return runWithAccount(accountId, fn);
  }
  if (creatorEnv().APP_ENV !== 'local') {
    throw new AuthRequiredError();
  }
  return fn();
}
