import { creatorEnv, type ServerEnv } from './env';

/**
 * Resolve the share/invite token pepper.
 * Production/preview/staging require SHARE_TOKEN_PEPPER.
 * Local falls back to a fixed non-production value (never store plaintext tokens).
 */
export function resolveShareTokenPepper(env: ServerEnv = creatorEnv()): string | null {
  if (env.SHARE_TOKEN_PEPPER && env.SHARE_TOKEN_PEPPER.length >= 16) {
    return env.SHARE_TOKEN_PEPPER;
  }
  if (env.APP_ENV === 'local') {
    return 'local-dev-share-token-pepper-do-not-use-in-prod';
  }
  return null;
}
