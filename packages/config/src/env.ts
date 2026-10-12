import { z } from 'zod';

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),
});

export const serverEnvSchema = publicEnvSchema.extend({
  APP_ENV: z.enum(['local', 'preview', 'staging', 'production']).default('local'),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  SHARE_TOKEN_PEPPER: z.string().min(16).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  DATABASE_URL: z.string().min(10).optional(),
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  /** Stripe Price id for Memorial Pack (ceremony), e.g. price_... */
  STRIPE_MEMORIAL_PACK_PRICE_ID: z.string().min(8).optional(),
  EMAIL_PROVIDER_API_KEY: z.string().min(8).optional(),
  EMAIL_FROM: z.email().optional(),
  MUSIC_CATALOG_ENABLED: z.enum(['true', 'false']).optional(),
  SUPPORT_OPS_TOKEN: z.string().min(32).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readPublicProcessEnv(): {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
} {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function parsePublicEnv(
  input: {
    NEXT_PUBLIC_APP_URL?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  } = readPublicProcessEnv(),
): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: input.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function parseServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: input.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    APP_ENV: input.APP_ENV,
    APP_ENCRYPTION_KEY: input.APP_ENCRYPTION_KEY,
    SHARE_TOKEN_PEPPER: input.SHARE_TOKEN_PEPPER,
    SUPABASE_SERVICE_ROLE_KEY: input.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: input.DATABASE_URL,
    STRIPE_SECRET_KEY: input.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: input.STRIPE_WEBHOOK_SECRET,
    STRIPE_MEMORIAL_PACK_PRICE_ID: input.STRIPE_MEMORIAL_PACK_PRICE_ID,
    EMAIL_PROVIDER_API_KEY: input.EMAIL_PROVIDER_API_KEY,
    EMAIL_FROM: input.EMAIL_FROM,
    MUSIC_CATALOG_ENABLED: input.MUSIC_CATALOG_ENABLED,
    SUPPORT_OPS_TOKEN: input.SUPPORT_OPS_TOKEN,
  });
}

export function isOpsTokenConfigured(env: Pick<ServerEnv, 'SUPPORT_OPS_TOKEN'>): boolean {
  return Boolean(env.SUPPORT_OPS_TOKEN && env.SUPPORT_OPS_TOKEN.length >= 32);
}

export function isMusicCatalogEnabled(env: Pick<ServerEnv, 'APP_ENV' | 'MUSIC_CATALOG_ENABLED'>): boolean {
  if (env.MUSIC_CATALOG_ENABLED === 'false') {
    return false;
  }
  if (env.MUSIC_CATALOG_ENABLED === 'true') {
    return true;
  }
  return env.APP_ENV === 'local' || env.APP_ENV === 'preview';
}

export function assertNoServerSecretsInPublic(env: ServerEnv): void {
  const publicJson = JSON.stringify({
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (env.SUPABASE_SERVICE_ROLE_KEY && publicJson.includes(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('service role leaked into public env');
  }
  if (env.STRIPE_SECRET_KEY && publicJson.includes(env.STRIPE_SECRET_KEY)) {
    throw new Error('stripe secret leaked into public env');
  }
}
