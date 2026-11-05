import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MembersActivityPanel } from '@/components/MembersActivityPanel';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { possessive, shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
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
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const count = tribute ? memoryCount(tribute) : 0;
  const readyCount = tribute ? readyMemoryCount(tribute) : 0;

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <Eyebrow>{creatorT(locale, 'creator.workspace.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.workspace.hero')}</Hero>
      <Lede>
        {tribute
          ? creatorT(locale, 'creator.workspace.ledeWith').replace(
              '{name}',
              possessive(tribute.displayName),
            )
          : creatorT(locale, 'creator.workspace.ledeWithout')}
      </Lede>

      <div className="grid gap-5 lg:grid-cols-[1.9fr_1fr]">
        <Card className="!p-7">
          <h2 className="serif text-[35px] m-0 mb-3">{creatorT(locale, 'creator.workspace.gather')}</h2>
          <p className="text-[color:var(--muted)] mb-6">
            {creatorT(locale, 'creator.workspace.gatherBody')}
          </p>
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
              {tribute
                ? creatorT(locale, 'creator.workspace.addMedia')
                : creatorT(locale, 'creator.common.beginSetup')}
            </Button>
            <span className="text-[14px] text-[color:var(--muted)]">
              {tribute
                ? creatorT(locale, 'creator.workspace.counts')
                    .replace('{count}', String(count))
                    .replace('{ready}', String(readyCount))
                : creatorT(locale, 'creator.workspace.noTribute')}
            </span>
          </div>
        </Card>
        <Card soft className="!p-7">
          <h2 className="serif text-[34px] m-0 mb-3">{creatorT(locale, 'creator.workspace.invite')}</h2>
          <p className="text-[color:var(--muted)] mb-8">
            {creatorT(locale, 'creator.workspace.inviteBody')}
          </p>
          <div className="bg-white rounded-[11px] min-h-[71px] flex items-center px-4 mb-5 text-[15px]">
            ⌁   {tribute ? `memorialvideo.app/add/${tribute.publicId.slice(0, 12)}…` : 'memorialvideo.app/add/…'}
          </div>
          <Button href="/contributors" className="btn-block">
            {creatorT(locale, 'creator.workspace.copyInvite')}
          </Button>
        </Card>
      </div>

      <h3 className="serif text-[32px] mt-10 mb-4">{creatorT(locale, 'creator.workspace.next')}</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['01', 'creator.workspace.step1Title', 'creator.workspace.step1Body'],
            ['02', 'creator.workspace.step2Title', 'creator.workspace.step2Body'],
            ['03', 'creator.workspace.step3Title', 'creator.workspace.step3Body'],
          ] as const
        ).map(([n, titleKey, bodyKey], i) => (
          <Card key={n} soft={i > 0} className="!p-5">
            <div className="text-[12px] font-bold text-[color:var(--accent)] mb-1">{n}</div>
            <div className="serif text-[18px] mb-2">{creatorT(locale, titleKey)}</div>
            <p className="text-[13px] text-[color:var(--muted)] m-0">{creatorT(locale, bodyKey)}</p>
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
            title={creatorT(locale, 'creator.workspace.emptyTitle')}
            body={creatorT(locale, 'creator.workspace.emptyBody')}
            primaryHref="/setup"
            primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
            tone="success"
          />
        </div>
      )}
    </AppShell>
  );
}
