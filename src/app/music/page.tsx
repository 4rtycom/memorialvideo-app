import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MusicDirectorPanel } from '@/components/MusicDirectorPanel';
import { Eyebrow, Hero, Lede } from '@/components/ui';
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
      footerTitle="Three songs are enough."
      footerBody="Opening, Memories, Farewell — change them anytime."
    >
      <Eyebrow>MUSIC & MOMENTS</Eyebrow>
      <Hero>Choose three favourite songs.</Hero>
      <Lede>
        Opening, Memories, and Farewell. Search, type a title, or paste a link as a reference for the
        venue. Add speech pauses for live moments at the service.
      </Lede>

      {tribute ? (
        <MusicDirectorPanel
          openingTitle={tribute.openingTitle}
          displayName={tribute.displayName}
          locale={locale}
        />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="Open a tribute first"
          body="Music and opening words save on the active tribute."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
          tone="success"
        />
      )}
    </AppShell>
  );
}
