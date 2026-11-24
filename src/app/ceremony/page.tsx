import { AppShell } from '@/components/AppShell';
import { CeremonyPlayer } from '@/components/CeremonyPlayer';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { creatorEnv } from '@/server/env';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';
import Link from 'next/link';

export const metadata = { title: 'Ceremony' };

/**
 * Dedicated ceremony operator surface — display + controls for live speech holds.
 * Venue ZIP also ships ceremony-player.html for offline use (MV-AUD-004).
 */
export default async function CeremonyPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute, locale);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;
  const origin = creatorEnv().NEXT_PUBLIC_APP_URL;
  const speechPauses = tribute?.musicDirectorPlan?.speechPauses ?? [];

  return (
    <AppShell
      cinema
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.ceremony.pageFooterTitle')}
      footerBody={creatorT(locale, 'creator.ceremony.pageFooterBody')}
    >
      <Eyebrow>{creatorT(locale, 'creator.ceremony.pageEyebrow')}</Eyebrow>
      <Hero className="!text-white">{creatorT(locale, 'creator.ceremony.pageHero')}</Hero>
      <Lede>{creatorT(locale, 'creator.ceremony.pageLede')}</Lede>

      <CeremonyPlayer
        timeline={timeline}
        origin={origin}
        speechPauses={speechPauses}
        locale={locale}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/share" variant="secondary">
          {creatorT(locale, 'creator.nav.share')}
        </Button>
        <Button href="/music" variant="ghost">
          {creatorT(locale, 'creator.ceremony.editPauses')}
        </Button>
        {!timeline ? (
          <Link className="btn btn-secondary" href="/film/creating">
            {creatorT(locale, 'creator.ceremony.arrange')}
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
