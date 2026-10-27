import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthNotConfiguredError,
  registerAndSignIn,
  signInWithPassword,
} from '@/server/account-session';
import { allowRequest } from '@/server/rate-limit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(200),
  mode: z.enum(['sign-in', 'register']),
});

export async function POST(request: Request) {
  if (!allowRequest('creator-password-auth', 10)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  try {
    const result =
      parsed.data.mode === 'register'
        ? await registerAndSignIn(parsed.data.email, parsed.data.password)
        : await signInWithPassword(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      const status = result.reason === 'exists' ? 409 : result.reason === 'invalid' ? 400 : 401;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return NextResponse.json({ error: 'auth_not_configured' }, { status: 503 });
    }
    throw error;
  }
}
