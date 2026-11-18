import type { Metadata } from 'next';
import { creatorT, type CreatorUiKey } from '@/lib/creator-ui-messages';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';

/** Per-page, localised <title>; the root layout adds the " · MemorialVideo" suffix. */
export async function pageTitle(key: CreatorUiKey): Promise<Metadata> {
  const locale = await resolveCreatorLocaleWithTribute(null);
  return { title: creatorT(locale, key) };
}
