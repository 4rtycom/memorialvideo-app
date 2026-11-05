import { AppShell } from '@/components/AppShell';
import { EnhancePanel } from '@/components/EnhancePanel';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function EnhancePage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const memories = (tribute?.memories ?? [])
    .filter((m) => m.ingestStatus === 'READY')
    .map((m) => ({ id: m.id, title: m.title, imagePath: m.imagePath }));

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <Eyebrow>{creatorT(locale, 'creator.enhance.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.enhance.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.enhance.lede')}</Lede>

      {tribute ? (
        <EnhancePanel
          memories={memories}
          consentLocal={tribute.enhancementConsentLocal}
          requests={tribute.enhancementRequests}
          hasTimeline={Boolean(tribute.timeline)}
        />
      ) : (
        <ErrorRecovery
          label={creatorT(locale, 'creator.enhance.emptyLabel')}
          title={creatorT(locale, 'creator.enhance.emptyTitle')}
          body={creatorT(locale, 'creator.enhance.emptyBody')}
          primaryHref="/setup"
          primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
          tone="success"
        />
      )}
    </AppShell>
  );
}
