import { NextResponse } from 'next/server';
import { checkoutProviderMode } from '@memorialvideo/domain';
import { publicSupabaseConfig } from '@/lib/supabase/env';
import { creatorEnv } from '@/server/env';
import { detectLocalEncoder } from '@/server/local-encode';
import { isDatabasePersistenceConfigured, resolvePersistence } from '@/server/persistence';
import { resolveShareTokenPepper } from '@/server/share-pepper';
import { isStripeMemorialPackConfigured } from '@/server/stripe-checkout';

export const runtime = 'nodejs';

export async function GET() {
  const env = creatorEnv();
  const stripeConfigured = isStripeMemorialPackConfigured(env);
  const mode = checkoutProviderMode({
    appEnv: env.APP_ENV,
    hasStripeSecret: stripeConfigured,
  });
  const supabase = publicSupabaseConfig();
  const persistence = await resolvePersistence();
  let dockerAvailable = false;
  // Vitest: skip docker daemon probe — `docker info` can hang ~timeout on CI runners
  // without a daemon and push unit tests over the default 5s budget.
  if (process.env.VITEST !== 'true') {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      await execFileAsync('docker', ['info'], { timeout: 1500 });
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }
  }
  const encoder = await detectLocalEncoder();
  const databaseConfigured = Boolean(supabase) || isDatabasePersistenceConfigured(env);

  return NextResponse.json({
    status: 'ready',
    app: 'creator',
    appEnv: env.APP_ENV,
    checkoutProviderMode: mode,
    stripeConfigured,
    signInConfigured: Boolean(supabase),
    databaseConfigured,
    supabaseStorageTus: false,
    localTus: persistence.kind === 'local_file',
    shareTokenPepper: Boolean(resolveShareTokenPepper(env)),
    dockerAvailable,
    renderEncoderAvailable: encoder.available,
    renderEncoderKind: encoder.kind,
    remotionOptIn: encoder.remotionOptIn,
    persistence: persistence.kind,
    persistenceWritable: persistence.writable,
    blockers: {
      xb005_stripe: !stripeConfigured,
      xb012_docker_supabase:
        !dockerAvailable || !supabase || persistence.xb012Persistence || !persistence.writable,
      xb011_deploy: true,
    },
  });
}
