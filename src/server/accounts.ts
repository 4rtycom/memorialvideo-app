import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { loadCreatorStore, saveCreatorStore, type CreatorAccount } from './store';

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

export async function registerAccount(email: string, password: string): Promise<AccountResult> {
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
