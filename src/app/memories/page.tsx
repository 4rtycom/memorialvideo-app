import { AddMemoryControl } from '@/components/AddMemoryControl';
import { AppShell } from '@/components/AppShell';
import { MemoriesPoller } from '@/components/MemoriesPoller';
import { MemoryLibraryFilters } from '@/components/MemoryLibraryFilters';
import { PeopleReviewPanel } from '@/components/PeopleReviewPanel';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import type { CreatorLibraryCard } from '@/lib/library-filters';
import { possessive, shellProject } from '@/lib/tribute-view';
import { memoryView } from '@/server/ingest';
import { loadActiveTribute } from '@/server/session';
import { hasInFlightIngest } from '@/server/store';

export default async function MemoriesPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const live = tribute?.memories ?? [];
  const inFlight = tribute ? hasInFlightIngest(tribute) : false;
  const cards: CreatorLibraryCard[] = live.map((m) => {
    const view = memoryView({ ingestStatus: m.ingestStatus, failureCode: m.failureCode });
    return {
      id: m.id,
      year: m.year || '—',
      title: m.title,
      label: view.label,
      uiStatus: view.uiStatus,
      imagePath: m.imagePath,
      createdAt: m.createdAt,
      source: m.source ?? 'owner',
      reviewState: m.reviewState ?? 'accepted',
    };
  });

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="Private by default"
      footerBody="Only invited people can contribute."
    >
      <MemoriesPoller active={inFlight} />
      <Eyebrow>YOUR MEMORY COLLECTION</Eyebrow>
      <Hero>Every moment has a place.</Hero>
      <Lede>
        {tribute
          ? `Browse, add and prepare the memories that tell ${possessive(tribute.displayName)} story.`
          : 'Create a tribute to start collecting memories.'}
      </Lede>

      <Card className="!p-4 mb-5">
        <div className="upload-zone">
          <div className="flex items-start gap-4">
            <span className="text-[35px] text-[color:var(--accent)] leading-none">＋</span>
            <div>
              <div className="font-medium text-[22px]">Drop photos or videos here</div>
              <p className="text-[13px] text-[color:var(--muted)] m-0">
                Or choose files from your device · JPG, PNG, HEIC, MP4
              </p>
            </div>
          </div>
          {tribute ? <AddMemoryControl nextIndex={live.length} /> : <Button href="/setup">Begin setup  ↗</Button>}
        </div>
      </Card>

      {cards.length === 0 ? (
        <Card soft className="!p-7">
          <h3 className="serif text-[28px] m-0 mb-2">No memories yet</h3>
          <p className="text-[color:var(--muted)] m-0">
            {tribute
              ? 'Add the first photo or video. Status moves uploading → processing → ready as durable jobs complete.'
              : 'Start setup to open a private tribute workspace.'}
          </p>
        </Card>
      ) : (
        <MemoryLibraryFilters cards={cards} />
      )}

      {tribute ? <PeopleReviewPanel /> : null}
    </AppShell>
  );
}
