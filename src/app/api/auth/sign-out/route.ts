import { NextResponse } from 'next/server';
import { clearAccountSession } from '@/server/account-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  await clearAccountSession();
  const host = request.headers.get('host') ?? '127.0.0.1:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  return NextResponse.redirect(`${proto}://${host}/sign-in`, 303);
}
