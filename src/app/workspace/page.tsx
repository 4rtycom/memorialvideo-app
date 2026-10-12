import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MembersActivityPanel } from '@/components/MembersActivityPanel';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { possessive, shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';
import { memoryCount, readyMemoryCount } from '@/server/store';

const thumbs = [
  '/fixtures/workspace-eleanor.png',
  '/fixtures/workspace-couple.png',
  '/fixtures/workspace-happy.png',
  '/fixtures/workspace-family.png',
];

export default async function WorkspacePage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const count = tribute ? memoryCount(tribute) : 0;
  const readyCount = tribute ? readyMemoryCount(tribute) : 0;

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial}>
      <Eyebrow>YOUR PERSONAL WORKSPACE</Eyebrow>
      <Hero>A beautiful film starts here.</Hero>
      <Lede>
        {tribute
          ? `Share a few memories for ${possessive(tribute.displayName)} story. Invite family. We’ll take care of the first edit.`
          : 'Share a few memories. Invite family. We’ll take care of the first edit.'}
      </Lede>

      <div className="grid gap-5 lg:grid-cols-[1.9fr_1fr]">
        <Card className="!p-7">
          <h2 className="serif text-[35px] m-0 mb-3">Gather the memories</h2>
          <p className="text-[color:var(--muted)] mb-6">Your story becomes richer with every photo and video.</p>
          <div className="flex gap-3 mb-6 overflow-x-auto">
            {(tribute?.memories.length
              ? tribute.memories.slice(0, 4).map((m) => m.imagePath)
              : thumbs
            ).map((src) => (
              <div key={src} className="relative w-[125px] h-[120px] shrink-0 rounded-[9px] overflow-hidden">
                <Image src={src} alt="" fill className="object-cover" sizes="125px" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button href={tribute ? '/memories' : '/setup'}>
              {tribute ? 'Add photos & videos  ↗' : 'Begin setup  ↗'}
            </Button>
            <span className="text-[14px] text-[color:var(--muted)]">
              {tribute
                ? `${count} added · ${readyCount} ready`
                : 'No tribute open yet'}
            </span>
          </div>
        </Card>
        <Card soft className="!p-7">
          <h2 className="serif text-[34px] m-0 mb-3">Invite loved ones</h2>
          <p className="text-[color:var(--muted)] mb-8">They can share photos and videos without creating an account.</p>
          <div className="bg-white rounded-[11px] min-h-[71px] flex items-center px-4 mb-5 text-[15px]">
            ⌁   {tribute ? `memorialvideo.app/add/${tribute.publicId.slice(0, 12)}…` : 'memorialvideo.app/add/…'}
          </div>
          <Button href="/contributors" className="btn-block">
            Copy invitation  ↗
          </Button>
        </Card>
      </div>

      <h3 className="serif text-[32px] mt-10 mb-4">What happens next?</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['01', 'Collect memories', 'Add yours and invite others.'],
          ['02', 'Create the first film', 'We arrange the story for you.'],
          ['03', 'Make it yours', 'Choose music, words and moments.'],
        ].map(([n, t, d], i) => (
          <Card key={n} soft={i > 0} className="!p-5">
            <div className="text-[12px] font-bold text-[color:var(--accent)] mb-1">{n}</div>
            <div className="serif text-[18px] mb-2">{t}</div>
            <p className="text-[13px] text-[color:var(--muted)] m-0">{d}</p>
          </Card>
        ))}
      </div>

      {tribute ? (
        <MembersActivityPanel
          initialMembers={tribute.members.map((m) => ({
            id: m.id,
            label: m.label,
            role: m.role,
            status: m.status,
            createdAt: m.createdAt,
          }))}
          initialActivity={tribute.activity.slice(0, 40).map((event) => ({
            id: event.id,
            code: event.code,
            correlationId: event.correlationId,
            createdAt: event.createdAt,
          }))}
        />
      ) : (
        <div className="mt-8">
          <ErrorRecovery
            label="EMPTY WORKSPACE"
            title="No memories yet"
            body="Start with one photograph after you begin setup."
            primaryHref="/setup"
            primaryLabel="Begin setup  ↗"
            tone="success"
          />
        </div>
      )}
    </AppShell>
  );
}
