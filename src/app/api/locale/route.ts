import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LAUNCH_LANGUAGES } from '@memorialvideo/contracts';
import { CREATOR_LOCALE_COOKIE, isCreatorLocale, resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { updateTribute } from '@/server/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  locale: z.enum(LAUNCH_LANGUAGES),
});

export async function GET() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  return NextResponse.json({
    locale,
    languages: LAUNCH_LANGUAGES,
    note: 'Creator UI drafts for locked launch languages. Native review remains XB-004.',
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isCreatorLocale(parsed.data.locale)) {
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  }
  const locale = parsed.data.locale;
  const tribute = await loadActiveTribute();
  if (tribute) {
    await updateTribute(tribute.publicId, { locale });
  }
  const response = NextResponse.json({ locale, persistedOnTribute: Boolean(tribute) });
  response.cookies.set(CREATOR_LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
