import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { allowRequest } from '@/server/rate-limit';

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  return createHash('sha256').update(forwarded).digest('hex').slice(0, 16);
}

/**
 * Magic-link request. Always returns ok (no email enumeration).
 * Requires Supabase public env; never invents secrets.
 */
export async function POST(request: Request) {
  const accepted = NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
  if (!allowRequest(`creator-auth-link:${clientKey(request)}`)) {
    return accepted;
  }

  let email = '';
  try {
    const payload = (await request.json()) as { email?: string };
    email = payload.email?.trim() ?? '';
  } catch {
    return accepted;
  }

  const supabase = await createSupabaseServer();
  if (!supabase || !email.includes('@')) {
    return accepted;
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });
  return accepted;
}
