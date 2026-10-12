import { parseServerEnv, type ServerEnv } from '@memorialvideo/config/env';

export type { ServerEnv };

export function creatorEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return parseServerEnv({
    ...input,
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3002',
    APP_ENV: input.APP_ENV ?? 'local',
  });
}

export function isLocalCreatorEnv(env: ServerEnv = creatorEnv()): boolean {
  return env.APP_ENV === 'local';
}
