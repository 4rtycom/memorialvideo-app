import { AppShell } from '@/components/AppShell';
import { ContributorReviewList } from '@/components/ContributorReviewList';
import { Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { memoryView } from '@/server/ingest';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function ReviewPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
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
      locale={locale}
      footerTitle={creatorT(locale, 'creator.common.privateByDefault')}
      footerBody={creatorT(locale, 'creator.common.onlyInvited')}
    >
      <Eyebrow>{creatorT(locale, 'creator.review.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.review.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.review.lede')}</Lede>

      <Card className="!px-6 !py-5 mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium text-[18px]">
            {creatorT(locale, 'creator.review.summary')
              .replace('{pending}', String(pendingCount))
              .replace('{total}', String(incoming.length))}
          </div>
          <p className="text-[color:var(--muted)] m-0 mt-1">
            {creatorT(locale, 'creator.review.summaryBody')}
          </p>
        </div>
      </Card>

      <ContributorReviewList items={incoming} locale={locale} />
      <p className="text-[13px] text-[color:var(--muted)] mt-6">
        {creatorT(locale, 'creator.review.duplicatesNote')}
      </p>
    </AppShell>
  );
}
