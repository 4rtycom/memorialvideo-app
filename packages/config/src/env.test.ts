import { describe, expect, it } from 'vitest';

import { assertNoServerSecretsInPublic, parsePublicEnv, parseServerEnv } from './env.js';

describe('environment boundaries', () => {
  it('reads public keys from process.env through static member access', () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-unit-test';
    try {
      expect(parsePublicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    } finally {
      if (previousUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      }
      if (previousKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
      }
    }
  });

  it('defaults the public app URL for local development', () => {
    expect(parsePublicEnv({}).NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('rejects an invalid public URL', () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow();
  });

  it('keeps server secrets out of the public snapshot', () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value',
      STRIPE_SECRET_KEY: 'sk_test_example_value',
    });
    expect(() => assertNoServerSecretsInPublic(env)).not.toThrow();
  });
});
