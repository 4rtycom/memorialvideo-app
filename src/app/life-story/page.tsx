import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { LifeStoryPanel } from '@/components/LifeStoryPanel';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { ensureStoryChapters } from '@/server/store';

export default async function LifeStoryPage() {
  const active = await loadActiveTribute();
  const tribute = active ? (await ensureStoryChapters(active.publicId)) ?? active : null;
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle="Create it in your own time."
      footerBody="Everything saves as you go."
    >
      <Eyebrow>A STORY ONLY THEIR LIFE COULD TELL</Eyebrow>
      <Hero>A beautiful beginning is taking shape.</Hero>
      <Lede>
        {creatorT(locale, 'creator.story.pageLede')}
      </Lede>

      {tribute ? (
        <LifeStoryPanel
          chapters={tribute.storyChapters}
          memories={tribute.memories.map((m) => ({
            id: m.id,
            title: m.title,
            imagePath: m.imagePath,
            year: m.year,
          }))}
          displayName={tribute.displayName}
          locale={locale}
        />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="No tribute open yet"
          body="Begin setup, then add memories so chapters can be suggested without inventing facts."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
          tone="success"
        />
      )}
    </AppShell>
  );
}
