import { AddMemoryControl } from '@/components/AddMemoryControl';
import { AppShell } from '@/components/AppShell';
import { InvitePanel } from '@/components/InvitePanel';
import { MemoriesPoller } from '@/components/MemoriesPoller';
import { MemoryLibraryFilters } from '@/components/MemoryLibraryFilters';
import { PeopleReviewPanel } from '@/components/PeopleReviewPanel';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import type { CreatorLibraryCard } from '@/lib/library-filters';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { memoryView } from '@/server/ingest';
import { listOwnerInvites } from '@/server/invites';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { hasInFlightIngest } from '@/server/store';
import Link from 'next/link';

export default async function MemoriesPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const live = tribute?.memories ?? [];
  const inFlight = tribute ? hasInFlightIngest(tribute) : false;
  const listed = tribute ? await listOwnerInvites(tribute.publicId) : null;
  const cards: CreatorLibraryCard[] = live.map((m) => {
    const view = memoryView({ ingestStatus: m.ingestStatus, failureCode: m.failureCode });
    return {
      id: m.id,
      year: m.year || '—',
      title: m.title,
      label: view.label,
      uiStatus: view.uiStatus,
      imagePath: m.imagePath,
      contentType: m.contentType,
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
      locale={locale}
      footerTitle={creatorT(locale, 'creator.memories.footerTitle')}
      footerBody={creatorT(locale, 'creator.memories.footerBody')}
    >
      <MemoriesPoller active={inFlight} />
      <Eyebrow>{creatorT(locale, 'creator.memories.pageEyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.memories.pageHero')}</Hero>
      <Lede>
        {tribute
          ? creatorT(locale, 'creator.memories.pageLedeWith').replace('{name}', tribute.displayName)
          : creatorT(locale, 'creator.memories.pageLedeWithout')}
      </Lede>

      <Card className="!p-4 mb-5">
        <div className="upload-zone">
          <div className="flex items-start gap-4">
            <span className="text-[35px] text-[color:var(--accent)] leading-none">＋</span>
            <div>
              <div className="font-medium text-[22px]">{creatorT(locale, 'creator.memories.drop')}</div>
              <p className="text-[13px] text-[color:var(--muted)] m-0">
                {creatorT(locale, 'creator.memories.formats')}
              </p>
            </div>
          </div>
          {tribute ? (
            <AddMemoryControl nextIndex={live.length} locale={locale} />
          ) : (
            <Button href="/setup">{creatorT(locale, 'creator.memories.beginSetup')}  ↗</Button>
          )}
        </div>
      </Card>

      {cards.length === 0 ? (
        <Card soft className="!p-7">
          <h3 className="serif text-[28px] m-0 mb-2">{creatorT(locale, 'creator.memories.emptyTitle')}</h3>
          <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.memories.emptyBody')}</p>
        </Card>
      ) : (
        <MemoryLibraryFilters cards={cards} />
      )}

      <section className="mt-10" data-testid="memories-invite-family" aria-labelledby="memories-invite-heading">
        <h2 id="memories-invite-heading" className="serif text-[28px] m-0 mb-2">
          {creatorT(locale, 'creator.nav.inviteFamily')}
        </h2>
        <p className="text-[color:var(--muted)] m-0 mb-5">
          {creatorT(locale, 'creator.contributors.lede')}
        </p>
        {tribute && listed ? (
          <>
            <InvitePanel
              initialInvites={listed.invites}
              initialProgress={listed.progress}
              initialCollectionStatus={listed.collectionStatus}
              previewName={tribute.displayName}
              locale={locale}
            />
            <p className="mt-5 mb-0">
              <Link className="btn btn-secondary" href="/contributors/review">
                {creatorT(locale, 'creator.nav.reviewContributions')}
              </Link>
            </p>
          </>
        ) : (
          <Card soft className="!p-7">
            <p className="text-[color:var(--muted)] m-0 mb-4">
              {creatorT(locale, 'creator.contributors.openBody')}
            </p>
            <Button href="/setup">{creatorT(locale, 'creator.common.beginSetup')}</Button>
          </Card>
        )}
      </section>

      {tribute ? <PeopleReviewPanel /> : null}
    </AppShell>
  );
}
