import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { GuidedVariantsPanel } from '@/components/GuidedVariantsPanel';
import { StudioEditor } from '@/components/StudioEditor';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';

export default async function StudioPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.studio.footerTitle')}
      footerBody=""
    >
      <Eyebrow>{creatorT(locale, 'creator.studio.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.studio.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.studio.lede')}</Lede>

      {!tribute ? (
        <ErrorRecovery
          label={creatorT(locale, 'creator.studio.emptyLabel')}
          title={creatorT(locale, 'creator.studio.emptyTitle')}
          body={creatorT(locale, 'creator.studio.emptyBody')}
          primaryHref="/setup"
          primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
          tone="success"
        />
      ) : timeline ? (
        <>
          <StudioEditor
            timeline={timeline}
            timelineVersion={tribute.timelineVersion}
            updatedAt={tribute.updatedAt}
            canUndo={Boolean(tribute.timelinePrevious)}
          />
          <GuidedVariantsPanel />
        </>
      ) : (
        <ErrorRecovery
          label={creatorT(locale, 'creator.studio.processingLabel')}
          title={creatorT(locale, 'creator.studio.processingTitle')}
          body={creatorT(locale, 'creator.studio.processingBody')}
          primaryHref="/film/creating"
          primaryLabel={creatorT(locale, 'creator.studio.arrangeCta')}
          secondaryHref="/film/edit"
          secondaryLabel={creatorT(locale, 'creator.studio.tryGuided')}
        />
      )}
    </AppShell>
  );
}
