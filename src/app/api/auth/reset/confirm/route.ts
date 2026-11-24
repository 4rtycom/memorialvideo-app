import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthNotConfiguredError, resetPasswordAndSignIn } from '@/server/account-session';
import { allowRequest, clientKey } from '@/server/rate-limit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  if (!allowRequest(`password-reset-confirm:${clientKey(request)}`, 10, 15 * 60_000)) {
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
    const result = await resetPasswordAndSignIn(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      const status = result.reason === 'invalid' ? 400 : 410;
      return NextResponse.json(
        { error: result.reason === 'invalid' ? 'invalid' : 'link_expired' },
        { status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return NextResponse.json({ error: 'auth_not_configured' }, { status: 503 });
    }
    throw error;
  }
}
