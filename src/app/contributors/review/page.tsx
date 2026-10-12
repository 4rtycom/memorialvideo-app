import { AppShell } from '@/components/AppShell';
import { ContributorReviewList } from '@/components/ContributorReviewList';
import { Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { memoryView } from '@/server/ingest';
import { loadActiveTribute } from '@/server/session';

export default async function ReviewPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const incoming = (tribute?.memories ?? [])
    .filter((m) => m.source === 'contributor')
    .map((m) => {
      const view = memoryView({ ingestStatus: m.ingestStatus, failureCode: m.failureCode });
      return {
        id: m.id,
        title: m.title,
        imagePath: m.imagePath,
        contributorName: m.contributorName,
        contributorNote: m.contributorNote,
        reviewState: m.reviewState ?? 'pending',
        label: view.label,
      };
    });
  const pendingCount = incoming.filter((m) => m.reviewState === 'pending').length;

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="Private by default"
      footerBody="Only invited people can contribute."
    >
      <Eyebrow>MEMORIES FROM PEOPLE WHO LOVED THEM</Eyebrow>
      <Hero>New moments have arrived.</Hero>
      <Lede>Review contributions before adding them to the film.</Lede>

      <Card className="!px-6 !py-5 mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium text-[18px]">
            ✉  {pendingCount} awaiting review · {incoming.length} from contributors
          </div>
          <p className="text-[color:var(--muted)] m-0 mt-1">
            Nothing is added to the film until you approve it.
          </p>
        </div>
      </Card>

      <ContributorReviewList items={incoming} />
      <p className="text-[13px] text-[color:var(--muted)] mt-6">
        Duplicates and low-quality photographs stay for your review.
      </p>
    </AppShell>
  );
}
