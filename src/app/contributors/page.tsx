import { AppShell } from '@/components/AppShell';
import { CollaborationInboxPanel } from '@/components/CollaborationInboxPanel';
import { InvitePanel } from '@/components/InvitePanel';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { listOwnerInvites } from '@/server/invites';
import { loadActiveTribute } from '@/server/session';

export default async function ContributorsPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const listed = tribute ? await listOwnerInvites(tribute.publicId) : null;

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="Private by default"
      footerBody="Only invited people can contribute."
    >
      <Eyebrow>A STORY BUILT TOGETHER</Eyebrow>
      <Hero>Some memories live with others.</Hero>
      <Lede>Invite family and friends to add their photos and videos—no account needed.</Lede>

      {tribute && listed ? (
        <InvitePanel
          initialInvites={listed.invites}
          initialProgress={listed.progress}
          initialCollectionStatus={listed.collectionStatus}
          previewName={tribute.displayName}
        />
      ) : (
        <div className="card !p-8">
          <h2 className="serif text-[35px] m-0 mb-3">Open a tribute first</h2>
          <p className="text-[color:var(--muted)] mb-6">
            Create a private tribute workspace, then share a hashed invitation link.
          </p>
          <Button href="/setup">Begin setup  ↗</Button>
        </div>
      )}

      <p className="serif text-[20px] mt-8 mb-4">You decide what becomes part of the film.</p>
      <Button href="/contributors/review" variant="secondary">
        Review incoming memories
      </Button>

      {tribute ? <CollaborationInboxPanel /> : null}
    </AppShell>
  );
}
