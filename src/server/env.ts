import { parseServerEnv, type ServerEnv } from '@memorialvideo/config/env';

export type { ServerEnv };

/**
 * Fail-closed default: only a developer machine (no Vercel, not NODE_ENV=production)
 * may fall back to `local`. Hosted deploys without an explicit APP_ENV are treated as
 * preview/production so local-only routes and fake checkout stay closed.
 */
function defaultAppEnv(input: NodeJS.ProcessEnv): 'local' | 'preview' | 'production' {
  if (input.VERCEL_ENV === 'production') return 'production';
  if (input.VERCEL_ENV === 'preview' || input.VERCEL_ENV === 'development') return 'preview';
  if (input.VERCEL === '1') return 'production';
  return input.NODE_ENV === 'production' ? 'production' : 'local';
}

export function creatorEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return parseServerEnv({
    ...input,
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3002',
    APP_ENV: input.APP_ENV ?? defaultAppEnv(input),
  });
}

export function isLocalCreatorEnv(env: ServerEnv = creatorEnv()): boolean {
  return env.APP_ENV === 'local';
}
