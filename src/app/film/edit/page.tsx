import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { GuidedEditor } from '@/components/GuidedEditor';
import { GuidedVariantsPanel } from '@/components/GuidedVariantsPanel';
import { MoreControlDisclosure } from '@/components/MoreControlDisclosure';
import { MusicDirectorPanel } from '@/components/MusicDirectorPanel';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { ADVANCED_STUDIO_HREF } from '@/lib/advanced-control';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';
import Link from 'next/link';

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
      footerTitle="No complicated timeline needed."
      footerBody=""
    >
      <Eyebrow>MAKE THE FILM FEEL LIKE THEM</Eyebrow>
      <Hero>Make a little change. Keep the magic.</Hero>
      <Lede>
        Choose a story moment below. Music uses the same Music Director as the Music page — three
        songs and speech pauses, without technical mix jargon.
      </Lede>

      {!tribute ? (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="No tribute open yet"
          body="Begin setup to create a private workspace before Guided editing."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
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
          <MoreControlDisclosure locale={locale} className="mt-6">
            <div className="flex flex-wrap gap-3 mb-4">
              <Link className="btn btn-secondary" href={ADVANCED_STUDIO_HREF}>
                {creatorT(locale, 'creator.film.studio')}
              </Link>
            </div>
            <GuidedVariantsPanel />
          </MoreControlDisclosure>
        </>
      ) : (
        <ErrorRecovery
          label="RESUMABLE PROCESSING"
          title="Film not arranged yet"
          body="Your memories are safe. Arrange the first film so Guided can edit your story."
          primaryHref="/film/creating"
          primaryLabel="Arrange first film  ↗"
          secondaryHref="/memories"
          secondaryLabel="Add memories"
        />
      )}
    </AppShell>
  );
}
