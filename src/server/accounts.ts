import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { loadCreatorStore, saveCreatorStore, type CreatorAccount } from './store';
import { withStoreLock } from './store-lock';

const scrypt = promisify(scryptCallback);

const EMAIL_MAX = 320;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function isAcceptableEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (normalized.length < 3 || normalized.length > EMAIL_MAX) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isAcceptablePassword(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltEncoded, keyEncoded] = stored.split('$');
  if (algo !== 'scrypt' || !saltEncoded || !keyEncoded) {
    return false;
  }
  const salt = Buffer.from(saltEncoded, 'base64url');
  const expected = Buffer.from(keyEncoded, 'base64url');
  const key = (await scrypt(password, salt, expected.length)) as Buffer;
  if (key.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(key, expected);
}

export function createAccountId(): string {
  return `acc_${randomBytes(8).toString('hex')}`;
}

export type AccountResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: 'invalid' | 'exists' | 'invalid_credentials' };

async function registerAccountUnlocked(email: string, password: string): Promise<AccountResult> {
  if (!isAcceptableEmail(email) || !isAcceptablePassword(password)) {
    return { ok: false, reason: 'invalid' };
  }
  const emailHash = hashEmail(email);
  const store = await loadCreatorStore();
  const existing = Object.values(store.accounts).find((account) => account.emailHash === emailHash);
  if (existing) {
    return { ok: false, reason: 'exists' };
  }
  const account: CreatorAccount = {
    id: createAccountId(),
    emailHash,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  store.accounts[account.id] = account;
  await saveCreatorStore(store);
  return { ok: true, accountId: account.id };
}

export async function authenticateAccount(email: string, password: string): Promise<AccountResult> {
  if (!isAcceptableEmail(email) || !isAcceptablePassword(password)) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  const emailHash = hashEmail(email);
  const store = await loadCreatorStore();
  const account = Object.values(store.accounts).find((candidate) => candidate.emailHash === emailHash);
  if (!account) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  const matches = await verifyPassword(password, account.passwordHash);
  if (!matches) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  return { ok: true, accountId: account.id };
}

const RESET_MINUTES = 30;

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mint a one-time reset token for the account behind this address (null when there is none). */
async function createPasswordResetUnlocked(email: string): Promise<{ token: string } | null> {
  if (!isAcceptableEmail(email)) {
    return null;
  }
  const emailHash = hashEmail(email);
  const store = await loadCreatorStore();
  const account = Object.values(store.accounts).find((candidate) => candidate.emailHash === emailHash);
  if (!account) {
    return null;
  }
  const token = randomBytes(32).toString('base64url');
  store.accounts[account.id] = {
    ...account,
    resetTokenHash: hashResetToken(token),
    resetExpiresAt: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
  };
  await saveCreatorStore(store);
  return { token };
}

/** Finish a reset: the token works once, then the new password is active. */
async function completePasswordResetUnlocked(token: string, password: string): Promise<AccountResult> {
  if (token.length < 20 || token.length > 200 || !isAcceptablePassword(password)) {
    return { ok: false, reason: 'invalid' };
  }
  const tokenHash = hashResetToken(token);
  const passwordHash = await hashPassword(password);
  const store = await loadCreatorStore();
  const account = Object.values(store.accounts).find(
    (candidate) => candidate.resetTokenHash && candidate.resetTokenHash === tokenHash,
  );
  if (!account || !account.resetExpiresAt || Date.parse(account.resetExpiresAt) < Date.now()) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  store.accounts[account.id] = { ...account, passwordHash, resetTokenHash: null, resetExpiresAt: null };
  await saveCreatorStore(store);
  return { ok: true, accountId: account.id };
}

export function registerAccount(...args: Parameters<typeof registerAccountUnlocked>): ReturnType<typeof registerAccountUnlocked> {
  return withStoreLock(() => registerAccountUnlocked(...args));
}

export function createPasswordReset(...args: Parameters<typeof createPasswordResetUnlocked>): ReturnType<typeof createPasswordResetUnlocked> {
  return withStoreLock(() => createPasswordResetUnlocked(...args));
}

export function completePasswordReset(...args: Parameters<typeof completePasswordResetUnlocked>): ReturnType<typeof completePasswordResetUnlocked> {
  return withStoreLock(() => completePasswordResetUnlocked(...args));
}
