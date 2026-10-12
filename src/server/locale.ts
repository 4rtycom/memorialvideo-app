import { cookies, headers } from 'next/headers';
import { LAUNCH_LANGUAGES, type LaunchLanguage } from '@memorialvideo/contracts';
import { resolveLanguage } from '@memorialvideo/i18n';

export const CREATOR_LOCALE_COOKIE = 'mv_creator_locale';

export function isCreatorLocale(value: string): value is LaunchLanguage {
  return (LAUNCH_LANGUAGES as readonly string[]).includes(value);
}

/** Prefer tribute locale, then cookie, then Accept-Language. */
export async function resolveCreatorLocaleWithTribute(
  tributeLocale?: string | null,
): Promise<LaunchLanguage> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get(CREATOR_LOCALE_COOKIE)?.value ?? null;
  return resolveLanguage({
    explicit: tributeLocale && isCreatorLocale(tributeLocale) ? tributeLocale : cookieLocale,
    pathnameLocale: null,
    acceptLanguage: headerStore.get('accept-language'),
  });
}
