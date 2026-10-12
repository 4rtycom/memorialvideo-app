import { NextResponse } from 'next/server';
import { publicSupabaseConfig } from '@/lib/supabase/env';
import { readAuthSession } from '@/lib/supabase/server';

export async function GET() {
  const configured = Boolean(publicSupabaseConfig());
  const session = await readAuthSession();
  return NextResponse.json({
    configured,
    signedIn: session?.signedIn ?? false,
    emailPresent: session?.emailPresent ?? false,
    ownerInitial: session?.ownerInitial ?? 'Y',
  });
}
