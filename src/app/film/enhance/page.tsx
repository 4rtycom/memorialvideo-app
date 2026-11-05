import { AppShell } from '@/components/AppShell';
import { EnhancePanel } from '@/components/EnhancePanel';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

export default async function EnhancePage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const memories = (tribute?.memories ?? [])
    .filter((m) => m.ingestStatus === 'READY')
    .map((m) => ({ id: m.id, title: m.title, imagePath: m.imagePath }));

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial}>
      <Eyebrow>GENTLE PHOTO IMPROVEMENT</Eyebrow>
      <Hero>Compare a local improvement with the original.</Hero>
      <Lede>
        Optional, reversible, and honest: only measured local correction is offered. Generative
        restoration stays off. Originals are always kept.
      </Lede>

      {tribute ? (
        <EnhancePanel
          memories={memories}
          consentLocal={tribute.enhancementConsentLocal}
          requests={tribute.enhancementRequests}
          hasTimeline={Boolean(tribute.timeline)}
        />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="No tribute open"
          body="Begin setup before requesting local photo improvement."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
          tone="success"
        />
      )}
    </AppShell>
  );
}
