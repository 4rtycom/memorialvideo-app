import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { GuidedEditor } from '@/components/GuidedEditor';
import { GuidedVariantsPanel } from '@/components/GuidedVariantsPanel';
import { MusicDirectorPanel } from '@/components/MusicDirectorPanel';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';

export default async function EditPage() {
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
      footerTitle={creatorT(locale, 'creator.edit.footerTitle')}
      footerBody=""
    >
      <Eyebrow>{creatorT(locale, 'creator.edit.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.edit.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.edit.lede')}</Lede>

      {!tribute ? (
        <ErrorRecovery
          label={creatorT(locale, 'creator.edit.emptyLabel')}
          title={creatorT(locale, 'creator.edit.emptyTitle')}
          body={creatorT(locale, 'creator.edit.emptyBody')}
          primaryHref="/setup"
          primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
          tone="success"
        />
      ) : timeline ? (
        <>
          <GuidedEditor
            timeline={timeline}
            timelineVersion={tribute.timelineVersion}
            updatedAt={tribute.updatedAt}
            canUndo={Boolean(tribute.timelinePrevious)}
            locale={locale}
          />
          <MusicDirectorPanel
            locale={locale}
            compact
            openingTitle={tribute.openingTitle}
            displayName={tribute.displayName}
          />
          <GuidedVariantsPanel />
        </>
      ) : (
        <ErrorRecovery
          label={creatorT(locale, 'creator.edit.processingLabel')}
          title={creatorT(locale, 'creator.edit.processingTitle')}
          body={creatorT(locale, 'creator.edit.processingBody')}
          primaryHref="/film/creating"
          primaryLabel={creatorT(locale, 'creator.edit.arrangeCta')}
          secondaryHref="/memories"
          secondaryLabel={creatorT(locale, 'creator.edit.addMemories')}
        />
      )}
    </AppShell>
  );
}
