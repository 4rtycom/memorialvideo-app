import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string, pepper: string): string {
  if (token.length < 16) {
    throw new Error('token entropy is below the minimum');
  }
  if (pepper.length < 16) {
    throw new Error('pepper is below the minimum');
  }
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

export function tokensMatch(token: string, pepper: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
