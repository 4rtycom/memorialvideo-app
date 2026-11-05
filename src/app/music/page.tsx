import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MusicDirectorPanel } from '@/components/MusicDirectorPanel';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function MusicPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.musicPage.footerTitle')}
      footerBody={creatorT(locale, 'creator.musicPage.footerBody')}
    >
      <Eyebrow>{creatorT(locale, 'creator.musicPage.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.musicPage.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.musicPage.lede')}</Lede>

      {tribute ? (
        <MusicDirectorPanel
          openingTitle={tribute.openingTitle}
          displayName={tribute.displayName}
          locale={locale}
        />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title={creatorT(locale, 'creator.musicPage.emptyTitle')}
          body={creatorT(locale, 'creator.musicPage.emptyBody')}
          primaryHref="/setup"
          primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
          tone="success"
        />
      )}
    </AppShell>
  );
}
