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
import Link from 'next/link';

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
      footerTitle="A beautiful film, made together."
      footerBody=""
    >
      <Eyebrow>ADVANCED TOOLS, WHEN YOU WANT THEM</Eyebrow>
      <Hero>Your film. Your creative control.</Hero>
      <Lede>
        Optional Advanced Studio for operators who want precise control. Families can stay on guided
        editing — aspect, length, order and transitions share the same film.
      </Lede>
      <p className="text-[13px] text-[color:var(--muted)] mb-6">
        <Link href="/film/edit" className="underline-offset-2 hover:underline">
          {creatorT(locale, 'creator.film.edit')}
        </Link>
        {' · '}
        {creatorT(locale, 'creator.moreControl')}
      </p>

      {!tribute ? (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="No tribute open yet"
          body="Begin setup before opening Studio."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
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
          label="RESUMABLE PROCESSING"
          title="Studio needs a TimelineContract"
          body="Arrange the first film, then return here for precise control."
          primaryHref="/film/creating"
          primaryLabel="Arrange first film  ↗"
          secondaryHref="/film/edit"
          secondaryLabel="Try Guided first"
        />
      )}
    </AppShell>
  );
}
