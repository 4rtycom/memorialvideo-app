import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { GuidedVariantsPanel } from '@/components/GuidedVariantsPanel';
import { StudioEditor } from '@/components/StudioEditor';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';

export default async function StudioPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="A beautiful film, made together."
      footerBody=""
    >
      <Eyebrow>ADVANCED TOOLS, WHEN YOU WANT THEM</Eyebrow>
      <Hero>Your film. Your creative control.</Hero>
      <Lede>
        Guided editing stays simple. Studio adjusts the same TimelineContract — aspect, length,
        order, transitions — with conflict-safe autosave.
      </Lede>

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
