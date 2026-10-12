import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { StylePicker } from '@/components/StylePicker';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

export default async function StylesPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="Create it in your own time."
      footerBody="Everything saves as you go."
    >
      <Eyebrow>BEFORE WE CREATE THE FIRST FILM</Eyebrow>
      <Hero>How should their story feel?</Hero>
      <Lede>Choose an atmosphere that reminds you of them.</Lede>

      {tribute ? (
        <StylePicker selectedTheme={tribute.themeKey} />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="Open a tribute first"
          body="Atmosphere choices save on the active tribute."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
          tone="success"
        />
      )}
    </AppShell>
  );
}
