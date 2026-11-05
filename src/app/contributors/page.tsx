import { AppShell } from '@/components/AppShell';
import { CollaborationInboxPanel } from '@/components/CollaborationInboxPanel';
import { InvitePanel } from '@/components/InvitePanel';
import { MoreControlDisclosure } from '@/components/MoreControlDisclosure';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { listOwnerInvites } from '@/server/invites';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function ContributorsPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const listed = tribute ? await listOwnerInvites(tribute.publicId) : null;

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.common.privateByDefault')}
      footerBody={creatorT(locale, 'creator.common.onlyInvited')}
    >
      <Eyebrow>{creatorT(locale, 'creator.contributors.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.contributors.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.contributors.lede')}</Lede>

      {tribute && listed ? (
        <InvitePanel
          initialInvites={listed.invites}
          initialProgress={listed.progress}
          initialCollectionStatus={listed.collectionStatus}
          previewName={tribute.displayName}
          locale={locale}
        />
      ) : (
        <div className="card !p-8">
          <h2 className="serif text-[35px] m-0 mb-3">
            {creatorT(locale, 'creator.contributors.openFirst')}
          </h2>
          <p className="text-[color:var(--muted)] mb-6">
            {creatorT(locale, 'creator.contributors.openBody')}
          </p>
          <Button href="/setup">{creatorT(locale, 'creator.common.beginSetup')}</Button>
        </div>
      )}

      <p className="serif text-[20px] mt-8 mb-4">
        {creatorT(locale, 'creator.contributors.decide')}
      </p>
      <Button href="/contributors/review" variant="secondary">
        {creatorT(locale, 'creator.contributors.review')}
      </Button>

      {tribute ? (
        <MoreControlDisclosure locale={locale} className="mt-8">
          <CollaborationInboxPanel />
        </MoreControlDisclosure>
      ) : null}
    </AppShell>
  );
}
