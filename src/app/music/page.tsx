import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MusicCatalogPanel } from '@/components/MusicCatalogPanel';
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
      footerTitle="No complicated timeline needed."
      footerBody=""
    >
      <Eyebrow>FINISHING TOUCHES</Eyebrow>
      <Hero>Set the feeling with music and words.</Hero>
      <Lede>Choose the soundtrack, opening words and gentle details. You can always change them.</Lede>

      {tribute ? (
        <MusicCatalogPanel
          selectedTrackId={tribute.soundtrackTrackId}
          rightsConfirmed={tribute.musicRightsConfirmed}
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
